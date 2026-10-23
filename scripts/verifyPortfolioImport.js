const assert = require("assert");
const { parsePortfolioCsv, addCash, CASH_TICKER } = require("./lib/portfolioImport");
const schwab = [
  '"Positions for account Test ...123 as of 10:00 AM ET, 2026/10/22"', "",
  '"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Asset Type",',
  '"AAA","A INC","10","$5.00","$50.00","$40.00","Equity",',
  '"AAA","A INC","30","$5.00","$150.00","$200.00","Equity",',
  '"DPRO 01/15/2027 10.00 C","CALL DRAGANFLY","35","$0.85","$2,975.00","$5,948.15","Option",',
  '"Cash & Cash Investments","--","--","--","$1,234.50","--","Cash and Money Market",',
  '"Positions Total","","--","--","$1,434.50","--","--",',
].join("\n");
const p = parsePortfolioCsv(schwab);
assert.strictEqual(p.broker, "schwab");
assert.strictEqual(p.account, "Test ...123");
const aaa = p.positions.find((x) => x.ticker === "AAA");
assert.strictEqual(aaa.quantity, 40, "duplicate rows sum shares");
assert.strictEqual(aaa.avg_cost, 6, "duplicate rows weight cost by dollars: (40+200)/40");
assert.strictEqual(aaa.exportPrice, 5, "Schwab rows carry a seed price of market value over quantity");
assert.strictEqual(p.positions.find((x) => x.ticker === CASH_TICKER).quantity, 1234.5);
assert.strictEqual(p.positions.find((x) => x.ticker.startsWith("DPRO")).exportPrice, 85, "an option seeds per contract, matching its avg_cost");
assert.throws(() => addCash(p, 100), /double-count/, "cash refused when file has a cash row");
assert.throws(() => parsePortfolioCsv("a,b\n1,2"), /broker format/, "unknown format rejected");
const v = parsePortfolioCsv('Account Number,Symbol/CUSIP,Investment Name,Shares,Total cost,Cost basis method\n1,VOO,VANGUARD S&P,2,"$800.00",FIFO\n1,VOO,VANGUARD S&P,1,"$100.00",FIFO\n1,BRK B,BERKSHIRE,1,"$400.00",FIFO');
assert.strictEqual(v.broker, "vanguard");
assert.strictEqual(v.positions.find((x) => x.ticker === "VOO").avg_cost, 300);
assert.ok(v.positions.some((x) => x.ticker === "BRK.B"));
addCash(v, 5000);
assert.strictEqual(v.positions.find((x) => x.ticker === CASH_TICKER).quantity, 5000);
console.log("portfolioImport checks passed");
