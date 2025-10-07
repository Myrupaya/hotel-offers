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

/** case-insensitive: find the first field whose KEY contains a substring */
function firstFieldByContains(obj, substr) {
  if (!obj) return undefined;
  const target = String(substr).toLowerCase();
  for (const k of Object.keys(obj)) {
    if (String(k).toLowerCase().includes(target)) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return undefined;
}

/** return all {key,value} pairs where predicate(key) is true (case-insensitive) */
function entriesWhereKey(obj, predicate) {
  if (!obj) return [];
  const out = [];
  for (const k of Object.keys(obj)) {
    if (predicate(String(k))) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        out.push({ key: k, value: v });
      }
    }
  }
  return out;
}

/** split across many separators (more robust than comma-only) */
function splitList(val) {
  if (!val) return [];
  return String(val)
    .split(/,|\/|;|\||\n|\r|\t|\band\b|\bAND\b|•/g)
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
  const n = a.length,
    m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
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

  const matchingWords = qWords.filter((qw) =>
    cWords.some((cw) => cw.includes(qw))
  ).length;
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
  const title =
    normalizeText(firstField(offer, LIST_FIELDS.title) || offer.Website || "");
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

/** ---- header/type detection for building marquee from OFFER CSVs (exclude allCards.csv) ---- */
const headerLooksDebit = (key) => {
  const k = String(key).toLowerCase();
  return /\bdebit\b/.test(k) && /\bcards?\b/.test(k);
};
const headerLooksCredit = (key) => {
  const k = String(key).toLowerCase();
  return /\bcredit\b/.test(k) && /\bcards?\b/.test(k);
};
const headerLooksEligibleCards = (key) => {
  const k = String(key).toLowerCase();
  return /\beligible\b/.test(k) && /\bcards?\b/.test(k);
};
function getRowTypeHint(row) {
  for (const k of Object.keys(row || {})) {
    const lk = k.toLowerCase();
    if (
      /\btype\b/.test(lk) ||
      /\bcard\s*type\b/.test(lk) ||
      /\bcategory\b/.test(lk) ||
      /\bsegment\b/.test(lk)
    ) {
      const v = String(row[k] || "").toLowerCase();
      if (/\bdebit\b/.test(v)) return "debit";
      if (/\bcredit\b/.test(v)) return "credit";
    }
  }
  return "";
}
const valueLooksDebit = (s) => /\bdebit\b/i.test(String(s || ""));
const valueLooksCredit = (s) => /\bcredit\b/i.test(String(s || ""));

/** Disclaimer */
const Disclaimer = () => (
  <section className="disclaimer">
    <h3>Disclaimer</h3>
    <p>
      All offers, coupons, and discounts listed on our platform are provided for
      informational purposes only. We do not guarantee the accuracy,
      availability, or validity of any offer. Users are advised to verify the
      terms and conditions with the respective merchants before making any
      purchase. We are not responsible for any discrepancies, expired offers, or
      losses arising from the use of these coupons.
    </p>
  </section>
);

/** -------------------- COMPONENT -------------------- */
const HotelOffers = () => {
  // dropdown data (from all_cards.csv ONLY)
  const [creditEntries, setCreditEntries] = useState([]);
  const [debitEntries, setDebitEntries] = useState([]);

  // 🔹 marquee lists (from offer CSVs ONLY — NOT all_cards.csv)
  const [marqueeCC, setMarqueeCC] = useState([]);
  const [marqueeDC, setMarqueeDC] = useState([]);

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
          { name: "EaseMyTrip.csv", setter: setEaseOffers },
          { name: "Yatra.csv", setter: setYatraOffers },
          { name: "Ixigo.csv", setter: setIxigoOffers },
          { name: "MakeMyTrip.csv", setter: setMakeMyTripOffers },
          { name: "Goibibo.csv", setter: setGoibiboOffers },
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

  /** 🔹 Build marquee (CC/DC chips) from OFFER CSVs ONLY — exclude allCards.csv */
  useEffect(() => {
    const ccMap = new Map(); // baseNorm -> display
    const dcMap = new Map();

    const harvestList = (val, targetMap) => {
      for (const raw of splitList(val)) {
        const base = brandCanonicalize(getBase(raw));
        const baseNorm = toNorm(base);
        if (baseNorm) targetMap.set(baseNorm, targetMap.get(baseNorm) || base);
      }
    };

    const harvestMixed = (val) => {
      for (const raw of splitList(val)) {
        const base = brandCanonicalize(getBase(raw));
        const baseNorm = toNorm(base);
        if (!baseNorm) continue;
        const lower = String(raw).toLowerCase();
        if (/\bdebit\b/.test(lower)) {
          dcMap.set(baseNorm, dcMap.get(baseNorm) || base);
        } else if (/\bcredit\b/.test(lower)) {
          ccMap.set(baseNorm, ccMap.get(baseNorm) || base);
        }
      }
    };

    /** If no explicit cc/dc fields, scan all values; tokens containing 'card' get classified by 'debit'/'credit' */
    const harvestByValueScan = (row) => {
      for (const v of Object.values(row || {})) {
        if (!v || typeof v !== "string") continue;
        const tokens = splitList(v).filter((t) => /\bcard\b/i.test(t));
        for (const tok of tokens) {
          const base = brandCanonicalize(getBase(tok));
          const baseNorm = toNorm(base);
          if (!baseNorm) continue;
          if (valueLooksDebit(tok)) dcMap.set(baseNorm, dcMap.get(baseNorm) || base);
          else if (valueLooksCredit(tok)) ccMap.set(baseNorm, ccMap.get(baseNorm) || base);
        }
      }
    };

    const harvestRows = (rows) => {
      for (const o of rows || []) {
        const debitHeaders = entriesWhereKey(o, (k) => headerLooksDebit(k));
        const creditHeaders = entriesWhereKey(o, (k) => headerLooksCredit(k));

        if (debitHeaders.length) {
          debitHeaders.forEach(({ value }) => harvestList(value, dcMap));
        }
        if (creditHeaders.length) {
          creditHeaders.forEach(({ value }) => harvestList(value, ccMap));
        }

        // mixed: “Eligible Cards”, “Cards”, etc.
        const mixedHeaders = entriesWhereKey(
          o,
          (k) => headerLooksEligibleCards(k) || /\bcards?\b/i.test(k)
        ).filter(({ key }) => !headerLooksDebit(key) && !headerLooksCredit(key));

        if (mixedHeaders.length) {
          const typeHint = getRowTypeHint(o);
          mixedHeaders.forEach(({ value }) => {
            if (typeHint === "debit") harvestList(value, dcMap);
            else if (typeHint === "credit") harvestList(value, ccMap);
            else harvestMixed(value); // per-token classify
          });
        }

        // If nothing obvious was added, try scanning any cell values
        if (!debitHeaders.length && !creditHeaders.length && !mixedHeaders.length) {
          harvestByValueScan(o);
        }
      }
    };

    // Harvest from hotel offer CSVs
    harvestRows(easeOffers);
    harvestRows(yatraOffers);
    harvestRows(ixigoOffers);
    harvestRows(makeMyTripOffers);
    harvestRows(goibiboOffers);

    // Permanent: only CC
    for (const o of permanentOffers || []) {
      const nm =
        firstField(o, LIST_FIELDS.permanentCCName) ||
        firstFieldByContains(o, "credit card name");
      if (!nm) continue;
      const base = brandCanonicalize(getBase(nm));
      const baseNorm = toNorm(base);
      if (baseNorm) ccMap.set(baseNorm, ccMap.get(baseNorm) || base);
    }

    setMarqueeCC(Array.from(ccMap.values()).sort((a, b) => a.localeCompare(b)));
    setMarqueeDC(Array.from(dcMap.values()).sort((a, b) => a.localeCompare(b)));
  }, [
    easeOffers,
    yatraOffers,
    ixigoOffers,
    makeMyTripOffers,
    goibiboOffers,
    permanentOffers,
  ]);

  /** 🔎 search box with debit-first ordering when query hints debit */
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

    // If input hints "debit", show Debit first then Credit
    // Matches: "dc", "debit", "debit card", "debit cards" (substring, case-insensitive)
    const debitHint =
      q.includes("debit") ||
      q.includes("debit card") ||
      q.includes("debit cards") ||
      q.includes("dc");

    const scored = (arr) =>
      arr
        .map((it) => {
          const s = scoreCandidate(val, it.display);
          const inc = it.display.toLowerCase().includes(q);
          return { it, s, inc };
        })
        .filter(({ s, inc }) => inc || s > 0.3)
        .sort((a, b) => b.s - a.s || a.it.display.localeCompare(b.it.display))
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

    const firstList = debitHint ? dc : cc;
    const firstLabel = debitHint ? "Debit Cards" : "Credit Cards";
    const secondList = debitHint ? cc : dc;
    const secondLabel = debitHint ? "Credit Cards" : "Debit Cards";

    setNoMatches(false);
    setFilteredCards([
      ...(firstList.length ? [{ type: "heading", label: firstLabel }] : []),
      ...firstList,
      ...(secondList.length ? [{ type: "heading", label: secondLabel }] : []),
      ...secondList,
    ]);
  };

  const onPick = (entry) => {
    setSelected(entry);
    setQuery(entry.display);
    setFilteredCards([]);
    setNoMatches(false);
  };

  // 🔹 Click a chip → set the dropdown + selected entry
  const handleChipClick = (name, type) => {
    const display = brandCanonicalize(getBase(name));
    const baseNorm = toNorm(display);
    setQuery(display);
    setSelected({ type, display, baseNorm });
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
        // wider DC detection
        const dcExplicit =
          firstField(o, LIST_FIELDS.debit) ||
          firstFieldByContains(o, "eligible debit") ||
          firstFieldByContains(o, "debit card");
        const dcFromHeaders = dcExplicit ? splitList(dcExplicit) : [];
        let dc = [...dcFromHeaders];

        if (!dc.length) {
          const typeHint = getRowTypeHint(o);
          const mixed =
            firstFieldByContains(o, "eligible cards") ||
            firstFieldByContains(o, "cards");
          if (mixed && typeHint === "debit") dc = splitList(mixed);
        }
        if (!dc.length) {
          // final: scan all values for tokens containing 'debit'
          const tokens = Object.values(o || {})
            .filter((v) => typeof v === "string")
            .flatMap((v) => splitList(v))
            .filter((t) => /\bdebit\b/i.test(t));
          dc = tokens;
        }
        list = dc;
      } else {
        const cc =
          firstField(o, LIST_FIELDS.credit) ||
          firstFieldByContains(o, "eligible credit") ||
          firstFieldByContains(o, "credit card") ||
          firstFieldByContains(o, "eligible cards");
        list = splitList(cc);
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
  const wGoibibo = matchesFor(
    goibiboOffers,
    selected?.type === "debit" ? "debit" : "credit",
    "Goibibo"
  );
  const wEase = matchesFor(
    easeOffers,
    selected?.type === "debit" ? "debit" : "credit",
    "EaseMyTrip"
  );
  const wYatra = matchesFor(
    yatraOffers,
    selected?.type === "debit" ? "debit" : "credit",
    "Yatra"
  );
  const wIxigo = matchesFor(
    ixigoOffers,
    selected?.type === "debit" ? "debit" : "credit",
    "Ixigo"
  );
  const wMMT = matchesFor(
    makeMyTripOffers,
    selected?.type === "debit" ? "debit" : "credit",
    "MakeMyTrip"
  );

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
    const desc = isPermanent
      ? firstField(o, LIST_FIELDS.permanentBenefit)
      : firstField(o, LIST_FIELDS.desc);
    const link = firstField(o, LIST_FIELDS.link);

    const showVariantNote =
      VARIANT_NOTE_SITES.has(wrapper.site) &&
      wrapper.variantText &&
      wrapper.variantText.trim().length > 0;

    return (
      <div className="offer-card">
        {image && <img src={image} alt={title} />}
        <div className="offer-info">
          <h3 className="offer-title">{title}</h3>

          {desc && <p className="offer-desc">{desc}</p>}

          {isPermanent && (
            <p className="inbuilt-note">
              <strong>This is a inbuilt feature of this credit card</strong>
            </p>
          )}

          {showVariantNote && (
            <p className="network-note">
              <strong>Note:</strong> This benefit is applicable only on{" "}
              <em>{wrapper.variantText}</em> variant
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
      {/* 🔹 Cards-with-offers strip (ONLY from offer CSVs; excludes allCards.csv) */}
      {(marqueeCC.length > 0 || marqueeDC.length > 0) && (
        <div
          style={{
            maxWidth: 1200,
            margin: "14px auto 0",
            padding: "14px 16px",
            background: "#F7F9FC",
            border: "1px solid #E8EDF3",
            borderRadius: 10,
            boxShadow: "0 6px 18px rgba(15,23,42,.06)",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "#1F2D45",
              marginBottom: 10,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <span>Credit &amp; Debit Cards With Active Hotel Offers</span>
          </div>

          {/* CC marquee chips */}
          {marqueeCC.length > 0 && (
            <marquee
              direction="left"
              scrollamount="4"
              style={{ marginBottom: 8, whiteSpace: "nowrap" }}
            >
              <strong style={{ marginRight: 10, color: "#1F2D45" }}>
                Credit Cards:
              </strong>
              {marqueeCC.map((name, idx) => (
                <span
                  key={`cc-chip-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleChipClick(name, "credit")}
                  onKeyDown={(e) =>
                    e.key === "Enter" ? handleChipClick(name, "credit") : null
                  }
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    border: "1px solid #E0E6EE",
                    borderRadius: 9999,
                    marginRight: 8,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1.2,
                    userSelect: "none",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "#F0F5FF")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "#fff")
                  }
                  title="Click to select this card"
                >
                  {name}
                </span>
              ))}
            </marquee>
          )}

          {/* DC marquee chips */}
          {marqueeDC.length > 0 && (
            <marquee
              direction="left"
              scrollamount="4"
              style={{ whiteSpace: "nowrap" }}
            >
              <strong style={{ marginRight: 10, color: "#1F2D45" }}>
                Debit Cards:
              </strong>
              {marqueeDC.map((name, idx) => (
                <span
                  key={`dc-chip-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleChipClick(name, "debit")}
                  onKeyDown={(e) =>
                    e.key === "Enter" ? handleChipClick(name, "debit") : null
                  }
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    border: "1px solid #E0E6EE",
                    borderRadius: 9999,
                    marginRight: 8,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1.2,
                    userSelect: "none",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "#F0F5FF")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "#fff")
                  }
                  title="Click to select this card"
                >
                  {name}
                </span>
              ))}
            </marquee>
          )}
        </div>
      )}

      {/* Search / dropdown */}
      <div
        className="dropdown"
        style={{ position: "relative", width: "600px", margin: "20px auto" }}
      >
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
              border: "1px solid " + (noMatches ? "#d32f2f" : "#ccc"),
              borderRadius: "6px",
              backgroundColor: "#fff",
              position: "absolute",
              zIndex: 1000,
            }}
          >
            {filteredCards.map((item, idx) =>
              item.type === "heading" ? (
                <li
                  key={`h-${idx}`}
                  style={{ padding: "8px 10px", fontWeight: 700, background: "#fafafa" }}
                >
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
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "#f7f9ff")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
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
            bottom: isMobile ? 220 : 250,
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
