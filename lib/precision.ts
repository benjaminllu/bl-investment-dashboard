/**
 * Trims serialised float precision on data crossing into client components.
 *
 * Every number a server component hands a client component is written twice
 * into the response: once into the rendered HTML, and once into the inline RSC
 * flight payload that React replays to hydrate. A double like
 * `-0.5123285748992724` costs 20 bytes each time, and this app displays it as
 * `-0.5`. Measured 2026-08-28 against a production build, that waste came to
 * 14% of the `/sectors` payload and 19% of `/positioning`'s, and because gzip
 * compresses random digits poorly it was a larger share of the wire cost than
 * of the raw one — 27% and 30% respectively.
 *
 *
 * WHY SIGNIFICANT DIGITS AND NOT DECIMAL PLACES
 *
 * `toFixed(3)` is very slightly smaller but is the wrong rule, because it is
 * not scale-invariant. The rotation payload holds values from 0.0033 to about
 * 1100; fixing three decimals leaves the small end with two significant digits
 * while still carrying more precision than needed at the large end. Six
 * significant digits treats both the same way.
 *
 * Six specifically, rather than four, which would save another ~5%: the widest
 * number this app renders is four integer digits shown to two decimals — see
 * the `toFixed(2)` sites in SignalEfficacy and KoreaLeveragePanel — and that is
 * exactly six significant digits. Anything less is capable of changing a
 * displayed value, which is not a trade worth 5%. This is a serialisation
 * concern only: it must run on finished output, never on values still being
 * computed with.
 *
 *
 * WHY INTEGERS ARE LEFT ALONE
 *
 * `toPrecision` would rewrite a large integer through exponent notation and
 * lose the low digits — 1234567 becomes 1234570. Counts, ranks and observation
 * totals are integers, they are already short, and there is nothing to trim, so
 * they are passed through untouched.
 */

/** Four integer digits at two decimals — the widest value this app displays. */
const SIGNIFICANT_DIGITS = 6;

function trimNumber(n: number): number {
  // Integers are already minimal, and `toPrecision` would corrupt long ones.
  // Non-finite values (NaN, ±Infinity) have no decimal expansion to trim.
  if (Number.isInteger(n) || !Number.isFinite(n)) return n;
  return Number(n.toPrecision(SIGNIFICANT_DIGITS));
}

/**
 * Deep-copies `value`, rounding every non-integer finite number in it.
 *
 * Structure-preserving over the plain JSON shapes that cross the server/client
 * boundary: arrays, plain objects, and primitives. It is deliberately not
 * written to handle Map, Set or Date — nothing serialisable to a client
 * component in this app returns one, and silently mangling one would be worse
 * than the type error that catches it.
 */
export function trimFloats<T>(value: T): T {
  if (typeof value === "number") return trimNumber(value) as T;
  if (Array.isArray(value)) return value.map(trimFloats) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = trimFloats(v);
    return out as T;
  }
  return value;
}
