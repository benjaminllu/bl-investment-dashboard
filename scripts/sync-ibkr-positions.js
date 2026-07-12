const fs = require("fs");
const https = require("https");
const { createClient } = require("@supabase/supabase-js");

const envContent = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const GATEWAY = "https://localhost:5000/v1/api";

// The gateway serves https://localhost:5000 with a self-signed cert (see the
// project memory on this) -- curl needs -k for the same reason. This agent is
// passed explicitly to gateway requests only -- it must NOT be a process-wide
// setting (e.g. NODE_TLS_REJECT_UNAUTHORIZED), which would also disable cert
// verification for the Supabase calls below that carry the service role key.
const gatewayAgent = new https.Agent({ rejectUnauthorized: false });

function gatewayGet(path) {
  return new Promise((resolve, reject) => {
    // The gateway rejects requests with no User-Agent header (403 Access
    // Denied) -- Node's https.get sends none by default, unlike curl/browsers.
    const options = { agent: gatewayAgent, headers: { "User-Agent": "sync-ibkr-positions.js", Accept: "*/*" } };
    https.get(`${GATEWAY}${path}`, options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GET ${path} failed (${res.statusCode})`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`GET ${path} returned invalid JSON: ${e.message}`));
        }
      });
    }).on("error", reject);
  });
}

async function getAccountIds() {
  // Also serves as the required "warm-up" call -- the /portfolio endpoints
  // return empty until /iserver/accounts has been hit at least once this session.
  try {
    const data = await gatewayGet("/iserver/accounts");
    return data.accounts || [];
  } catch (e) {
    throw new Error(
      `${e.message}. Is the IBKR Client Portal Gateway running and logged in at https://localhost:5000?`
    );
  }
}

async function getPositions(accountId) {
  return gatewayGet(`/portfolio/${accountId}/positions/0`);
}

async function main() {
  console.log("Fetching accounts from IBKR gateway...");
  const accountIds = await getAccountIds();
  if (accountIds.length === 0) {
    console.error("No accounts returned -- check that the gateway session is logged in.");
    process.exit(1);
  }

  const rows = [];
  for (const accountId of accountIds) {
    console.log(`Fetching positions for ${accountId}...`);
    const positions = await getPositions(accountId);
    for (const p of positions) {
      if (!p.position) continue; // skip zero-quantity / closed positions
      rows.push({
        conid: p.conid,
        ticker: p.contractDesc,
        company: p.name || null,
        quantity: p.position,
        avg_cost: p.avgCost ?? null,
        currency: p.currency || null,
      });
    }
  }

  console.log(`Replacing ibkr_positions with ${rows.length} position(s)...`);

  // Full replace, not incremental upsert -- a closed position must disappear
  // from the table, not linger from a previous sync.
  const { error: deleteError } = await supabase
    .from("ibkr_positions")
    .delete()
    .not("id", "is", null);
  if (deleteError) {
    console.error("Failed to clear existing positions:", deleteError.message);
    process.exit(1);
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("ibkr_positions").insert(rows);
    if (insertError) {
      console.error("Failed to insert positions:", insertError.message);
      process.exit(1);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
