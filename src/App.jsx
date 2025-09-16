import React, { useEffect, useState } from "react";
import axios from "axios";
import Papa from "papaparse";
import "./App.css";

/** -------------------- CONFIG -------------------- */
const LIST_FIELDS = {
  credit: ["Eligible Credit Cards", "Eligible Cards"],
  debit: ["Eligible Debit Cards", "Applicable Debit Cards"],
  title: ["Offer Title", "Title"],
  image: ["Image", "Credit Card Image", "Offer Image"],
  link: ["Link", "Offer Link"],
  desc: ["Description", "Details", "Offer Description", "Flight Benefit"],
  // Permanent (inbuilt) CSV fields
  permanentCCName: ["Credit Card Name"],
  permanentBenefit: ["Flight Benefit", "Benefit", "Offer", "Hotel Benefit"],
};

const MAX_SUGGESTIONS = 50;

/** Sites that show the red per-card “Applicable only on {variant} variant” note */
const VARIANT_NOTE_SITES = new Set([
  "EaseMyTrip",
  "Yatra",
  "Ixigo",
  "MakeMyTrip",
  "Goibibo",
  "Permanent",
]);

/** -------------------- HELPERS -------------------- */
const toNorm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function firstField(obj, keys) {
  for (const k of keys) {
    if (
      obj &&
      Object.prototype.hasOwnProperty.call(obj, k) &&
      obj[k] !== undefined &&
      obj[k] !== null &&
      String(obj[k]).trim() !== ""
    ) {
      return obj[k];
    }
  }
  return undefined;
}

function splitList(val) {
  if (!val) return [];
  return String(val)
    .replace(/\n/g, " ")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Strip trailing parentheses: "HDFC Regalia (Visa Signature)" -> "HDFC Regalia" */
function getBase(name) {
  if (!name) return "";
  return String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Variant if present at end-in-parens: "… (Visa Signature)" -> "Visa Signature" */
function getVariant(name) {
  if (!name) return "";
  const m = String(name).match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : "";
}

/** Canonicalize some common brand spellings */
function brandCanonicalize(text) {
  let s = String(text || "");
  s = s.replace(/\bMakemytrip\b/gi, "MakeMyTrip");
  s = s.replace(/\bIcici\b/gi, "ICICI");
  s = s.replace(/\bHdfc\b/gi, "HDFC");
  s = s.replace(/\bSbi\b/gi, "SBI");
  s = s.replace(/\bIdfc\b/gi, "IDFC");
  s = s.replace(/\bPnb\b/gi, "PNB");
  s = s.replace(/\bRbl\b/gi, "RBL");
  s = s.replace(/\bYes\b/gi, "YES");
  return s;
}

/** Levenshtein distance */
function lev(a, b) {
  a = toNorm(a);
  b = toNorm(b);
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[n][m];
}

function scoreCandidate(q, cand) {
  const qs = toNorm(q);
  const cs = toNorm(cand);
  if (!qs) return 0;
  if (cs.includes(qs)) return 100;

  const qWords = qs.split(" ").filter(Boolean);
  const cWords = cs.split(" ").filter(Boolean);

  const matchingWords = qWords.filter((qw) => cWords.some((cw) => cw.includes(qw))).length;
  const sim = 1 - lev(qs, cs) / Math.max(qs.length, cs.length);
  return (matchingWords / Math.max(1, qWords.length)) * 0.7 + sim * 0.3;
}

/** Dropdown entry builder */
function makeEntry(raw, type) {
  const base = brandCanonicalize(getBase(raw));
  return { type, display: base, baseNorm: toNorm(base) };
}

function normalizeUrl(u) {
  if (!u) return "";
  let s = String(u).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
function normalizeText(s) {
  return toNorm(s || "");
}
function offerKey(offer) {
  const image = normalizeUrl(firstField(offer, LIST_FIELDS.image) || "");
  const title = normalizeText(firstField(offer, LIST_FIELDS.title) || offer.Website || "");
  const desc = normalizeText(firstField(offer, LIST_FIELDS.desc) || "");
  const link = normalizeUrl(firstField(offer, LIST_FIELDS.link) || "");
  return `${title}||${desc}||${image}||${link}`;
}

function dedupWrappers(arr, seen) {
  const out = [];
  for (const w of arr || []) {
    const k = offerKey(w.offer);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

/** Disclaimer */
const Disclaimer = () => (
  <section className="disclaimer">
    <h3>Disclaimer</h3>
    <p>
      All offers, coupons, and discounts listed on our platform are provided for informational purposes only.
      We do not guarantee the accuracy, availability, or validity of any offer. Users are advised to verify the
      terms and conditions with the respective merchants before making any purchase. We are not responsible for any
      discrepancies, expired offers, or losses arising from the use of these coupons.
    </p>
  </section>
);

/** -------------------- COMPONENT -------------------- */
const HotelOffers = () => {
  // dropdown data (from all_cards.csv ONLY)
  const [creditEntries, setCreditEntries] = useState([]);
  const [debitEntries, setDebitEntries] = useState([]);

  // ui state
  const [filteredCards, setFilteredCards] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // {type, display, baseNorm}
  const [noMatches, setNoMatches] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // offers (only the CSVs you listed)
  const [easeOffers, setEaseOffers] = useState([]);
  const [yatraOffers, setYatraOffers] = useState([]);
  const [ixigoOffers, setIxigoOffers] = useState([]);
  const [makeMyTripOffers, setMakeMyTripOffers] = useState([]);
  const [goibiboOffers, setGoibiboOffers] = useState([]);
  const [permanentOffers, setPermanentOffers] = useState([]);

  // responsive
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 1) Load all_cards.csv for dropdown lists ONLY
  useEffect(() => {
    async function loadAllCards() {
      try {
        const res = await axios.get(`/allCards.csv`);
        const parsed = Papa.parse(res.data, { header: true });
        const rows = parsed.data || [];

        const creditMap = new Map();
        const debitMap = new Map();

        for (const row of rows) {
          const ccList = splitList(firstField(row, LIST_FIELDS.credit));
          for (const raw of ccList) {
            const base = brandCanonicalize(getBase(raw));
            const baseNorm = toNorm(base);
            if (baseNorm) creditMap.set(baseNorm, creditMap.get(baseNorm) || base);
          }
          const dcList = splitList(firstField(row, LIST_FIELDS.debit));
          for (const raw of dcList) {
            const base = brandCanonicalize(getBase(raw));
            const baseNorm = toNorm(base);
            if (baseNorm) debitMap.set(baseNorm, debitMap.get(baseNorm) || base);
          }
        }

        const credit = Array.from(creditMap.values())
          .sort((a, b) => a.localeCompare(b))
          .map((d) => makeEntry(d, "credit"));
        const debit = Array.from(debitMap.values())
          .sort((a, b) => a.localeCompare(b))
          .map((d) => makeEntry(d, "debit"));

        setCreditEntries(credit);
        setDebitEntries(debit);

        setFilteredCards([
          ...(credit.length ? [{ type: "heading", label: "Credit Cards" }] : []),
          ...credit,
          ...(debit.length ? [{ type: "heading", label: "Debit Cards" }] : []),
          ...debit,
        ]);

        if (!credit.length && !debit.length) {
          setNoMatches(true);
          setSelected(null);
        }
      } catch (e) {
        console.error("all_cards.csv load error:", e);
        setNoMatches(true);
        setSelected(null);
      }
    }
    loadAllCards();
  }, []);

  // 2) Load ONLY the requested offer CSVs
  useEffect(() => {
    async function loadOffers() {
      try {
        const files = [
          { name: "easemytrip.csv", setter: setEaseOffers },
          { name: "yatra.csv", setter: setYatraOffers },
          { name: "ixigo.csv", setter: setIxigoOffers },
          { name: "makemytrip.csv", setter: setMakeMyTripOffers },
          { name: "goibibo.csv", setter: setGoibiboOffers },
          { name: "permanent_offers.csv", setter: setPermanentOffers },
        ];

        await Promise.all(
          files.map(async (f) => {
            const res = await axios.get(`/${encodeURIComponent(f.name)}`);
            const parsed = Papa.parse(res.data, { header: true });
            f.setter(parsed.data || []);
          })
        );
      } catch (e) {
        console.error("Offer CSV load error:", e);
      }
    }
    loadOffers();
  }, []);

  /** search box */
  const onChangeQuery = (e) => {
    const val = e.target.value;
    setQuery(val);

    if (!val.trim()) {
      setFilteredCards([]);
      setSelected(null);
      setNoMatches(false);
      return;
    }

    const q = val.trim().toLowerCase();
    const scored = (arr) =>
      arr
        .map((it) => {
          const s = scoreCandidate(val, it.display);
          const inc = it.display.toLowerCase().includes(q);
          return { it, s, inc };
        })
        .filter(({ s, inc }) => inc || s > 0.3)
        .sort((a, b) => (b.s - a.s) || a.it.display.localeCompare(b.it.display))
        .slice(0, MAX_SUGGESTIONS)
        .map(({ it }) => it);

    const cc = scored(creditEntries);
    const dc = scored(debitEntries);

    if (!cc.length && !dc.length) {
      setNoMatches(true);
      setSelected(null);
      setFilteredCards([]);
      return;
    }

    setNoMatches(false);
    setFilteredCards([
      ...(cc.length ? [{ type: "heading", label: "Credit Cards" }] : []),
      ...cc,
      ...(dc.length ? [{ type: "heading", label: "Debit Cards" }] : []),
      ...dc,
    ]);
  };

  const onPick = (entry) => {
    setSelected(entry);
    setQuery(entry.display);
    setFilteredCards([]);
    setNoMatches(false);
  };

  /** Build matches for one CSV: return wrappers {offer, site, variantText} */
  function matchesFor(offers, type, site) {
    if (!selected) return [];
    const out = [];
    for (const o of offers || []) {
      let list = [];
      if (type === "permanent") {
        const nm = firstField(o, LIST_FIELDS.permanentCCName);
        if (nm) list = [nm]; // single card name
      } else if (type === "debit") {
        list = splitList(firstField(o, LIST_FIELDS.debit));
      } else {
        list = splitList(firstField(o, LIST_FIELDS.credit));
      }

      let matched = false;
      let matchedVariant = "";
      for (const raw of list) {
        const base = brandCanonicalize(getBase(raw));
        if (toNorm(base) === selected.baseNorm) {
          matched = true;
          const v = getVariant(raw);
          if (v) matchedVariant = v;
          break;
        }
      }
      if (matched) {
        out.push({ offer: o, site, variantText: matchedVariant });
      }
    }
    return out;
  }

  // Collect then global-dedup (Permanent first, and only for credit)
  const wPermanent = matchesFor(permanentOffers, "permanent", "Permanent");
  const wGoibibo = matchesFor(goibiboOffers, selected?.type === "debit" ? "debit" : "credit", "Goibibo");
  const wEase = matchesFor(easeOffers, selected?.type === "debit" ? "debit" : "credit", "EaseMyTrip");
  const wYatra = matchesFor(yatraOffers, selected?.type === "debit" ? "debit" : "credit", "Yatra");
  const wIxigo = matchesFor(ixigoOffers, selected?.type === "debit" ? "debit" : "credit", "Ixigo");
  const wMMT = matchesFor(makeMyTripOffers, selected?.type === "debit" ? "debit" : "credit", "MakeMyTrip");

  const seen = new Set();
  const dPermanent = selected?.type === "credit" ? dedupWrappers(wPermanent, seen) : [];
  const dGoibibo = dedupWrappers(wGoibibo, seen);
  const dEase = dedupWrappers(wEase, seen);
  const dYatra = dedupWrappers(wYatra, seen);
  const dIxigo = dedupWrappers(wIxigo, seen);
  const dMMT = dedupWrappers(wMMT, seen);

  const hasAny = Boolean(
    dPermanent.length ||
    dGoibibo.length ||
    dEase.length ||
    dYatra.length ||
    dIxigo.length ||
    dMMT.length
  );

  /** Offer card UI */
  const OfferCard = ({ wrapper, isPermanent = false }) => {
    const o = wrapper.offer;
    const title = firstField(o, LIST_FIELDS.title) || o.Website || "Offer";
    const image = firstField(o, LIST_FIELDS.image);
    const desc = firstField(o, LIST_FIELDS.desc);
    const link = firstField(o, LIST_FIELDS.link);

    const showVariantNote =
      VARIANT_NOTE_SITES.has(wrapper.site) && wrapper.variantText && wrapper.variantText.trim().length > 0;

    const permanentBenefit = isPermanent ? firstField(o, LIST_FIELDS.permanentBenefit) : "";

    return (
      <div className="offer-card">
        {image && <img src={image} alt={title} />}
        <div className="offer-info">
          <h3 className="offer-title">{title}</h3>

          {isPermanent ? (
            <>
              {permanentBenefit && <p className="offer-desc">{permanentBenefit}</p>}
              <p className="inbuilt-note"><strong>This is a inbuilt feature of this credit card</strong></p>
            </>
          ) : (
            desc && <p className="offer-desc">{desc}</p>
          )}

          {showVariantNote && (
            <p className="network-note">
              <strong>Note:</strong> This benefit is applicable only on <em>{wrapper.variantText}</em> variant
            </p>
          )}

          {link && (
            <button className="btn" onClick={() => window.open(link, "_blank")}>
              View Offer
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="App" style={{ fontFamily: "'Libre Baskerville', serif" }}>
      {/* Search / dropdown */}
      <div className="dropdown" style={{ position: "relative", width: "600px", margin: "20px auto" }}>
        <input
          type="text"
          value={query}
          onChange={onChangeQuery}
          placeholder="Type a Credit or Debit Card...."
          className="dropdown-input"
          style={{
            width: "100%",
            padding: "12px",
            fontSize: "16px",
            border: `1px solid ${noMatches ? "#d32f2f" : "#ccc"}`,
            borderRadius: "6px",
          }}
        />
        {query.trim() && !!filteredCards.length && (
          <ul
            className="dropdown-list"
            style={{
              listStyle: "none",
              padding: "10px",
              margin: 0,
              width: "100%",
              maxHeight: "260px",
              overflowY: "auto",
              border: "1px solid #ccc",
              borderRadius: "6px",
              backgroundColor: "#fff",
              position: "absolute",
              zIndex: 1000,
            }}
          >
            {filteredCards.map((item, idx) =>
              item.type === "heading" ? (
                <li key={`h-${idx}`} style={{ padding: "8px 10px", fontWeight: 700, background: "#fafafa" }}>
                  {item.label}
                </li>
              ) : (
                <li
                  key={`i-${idx}-${item.display}`}
                  onClick={() => onPick(item)}
                  style={{
                    padding: "10px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f2f2f2",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#f7f9ff")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {item.display}
                </li>
              )
            )}
          </ul>
        )}
      </div>

      {noMatches && query.trim() && (
        <p style={{ color: "#d32f2f", textAlign: "center", marginTop: 8 }}>
          No matching cards found. Please try a different name.
        </p>
      )}

      {/* Offers by section */}
      {selected && hasAny && !noMatches && (
        <div className="offers-section" style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
          {!!dPermanent.length && (
            <div className="offer-group">
              <h2 style={{ textAlign: "center" }}>Permanent Offers</h2>
              <div className="offer-grid">
                {dPermanent.map((w, i) => (
                  <OfferCard key={`perm-${i}`} wrapper={w} isPermanent />
                ))}
              </div>
            </div>
          )}

          {!!dGoibibo.length && (
            <div className="offer-group">
              <h2 style={{ textAlign: "center" }}>Offers on Goibibo</h2>
              <div className="offer-grid">
                {dGoibibo.map((w, i) => (
                  <OfferCard key={`go-${i}`} wrapper={w} />
                ))}
              </div>
            </div>
          )}

          {!!dEase.length && (
            <div className="offer-group">
              <h2 style={{ textAlign: "center" }}>Offers on EaseMyTrip</h2>
              <div className="offer-grid">
                {dEase.map((w, i) => (
                  <OfferCard key={`emt-${i}`} wrapper={w} />
                ))}
              </div>
            </div>
          )}

          {!!dYatra.length && (
            <div className="offer-group">
              <h2 style={{ textAlign: "center" }}>Offers on Yatra</h2>
              <div className="offer-grid">
                {dYatra.map((w, i) => (
                  <OfferCard key={`y-${i}`} wrapper={w} />
                ))}
              </div>
            </div>
          )}

          {!!dIxigo.length && (
            <div className="offer-group">
              <h2 style={{ textAlign: "center" }}>Offers on Ixigo</h2>
              <div className="offer-grid">
                {dIxigo.map((w, i) => (
                  <OfferCard key={`ix-${i}`} wrapper={w} />
                ))}
              </div>
            </div>
          )}

          {!!dMMT.length && (
            <div className="offer-group">
              <h2 style={{ textAlign: "center" }}>Offers on MakeMyTrip</h2>
              <div className="offer-grid">
                {dMMT.map((w, i) => (
                  <OfferCard key={`mmt-${i}`} wrapper={w} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selected && !hasAny && !noMatches && (
        <p style={{ color: "#d32f2f", textAlign: "center", marginTop: 10 }}>
          No offer available for this card
        </p>
      )}

      {selected && hasAny && !noMatches && (
        <button
          onClick={() => window.scrollBy({ top: window.innerHeight, behavior: "smooth" })}
          style={{
            position: "fixed",
            right: 20,
            bottom: isMobile ? 20 : 150,
            padding: isMobile ? "12px 15px" : "10px 20px",
            backgroundColor: "#1e7145",
            color: "white",
            border: "none",
            borderRadius: isMobile ? "50%" : 8,
            cursor: "pointer",
            fontSize: 18,
            zIndex: 1000,
            boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
            width: isMobile ? 50 : 140,
            height: isMobile ? 50 : 50,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {isMobile ? "↓" : "Scroll Down"}
        </button>
      )}

      <Disclaimer />
    </div>
  );
};

export default HotelOffers;
