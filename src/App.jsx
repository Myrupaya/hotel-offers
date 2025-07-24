import React, { useState, useEffect } from "react";
import axios from "axios";
import Papa from "papaparse";
import "./App.css";

// Helper function to normalize card names
const normalizeCardName = (name) => {
  if (!name) return '';
  return name.trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ');
};

const splitCouponCodes = (codeStr) => {
  if (!codeStr) return [];
  return codeStr.split(/\s*\|\s*|\s*,\s*/).filter(code => code.trim() !== '');
};

// Helper to extract base card name (remove network variant)
const getBaseCardName = (name) => {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)$/, '').trim();
};

// Helper to extract network variant
const getNetworkVariant = (name) => {
  if (!name) return '';
  const match = name.match(/\(([^)]+)\)$/);
  return match ? match[1] : '';
};

// Fuzzy matching utility functions
const levenshteinDistance = (a, b) => {
  if (!a || !b) return 100;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
};

const getMatchScore = (query, card) => {
  if (!query || !card) return 0;
  const qWords = query.trim().toLowerCase().split(/\s+/);
  const cWords = card.trim().toLowerCase().split(/\s+/);

  if (card.toLowerCase().includes(query.toLowerCase())) return 100;

  const matchingWords = qWords.filter(qWord =>
    cWords.some(cWord => cWord.includes(qWord))
  ).length;

  const similarity = 1 - (levenshteinDistance(query.toLowerCase(), card.toLowerCase()) /
    Math.max(query.length, card.length));

  return (matchingWords / qWords.length) * 0.7 + similarity * 0.3;
};

const highlightMatch = (text, query) => {
  if (!query.trim()) return text;

  const regex = new RegExp(`(${query.trim().split(/\s+/).map(word =>
    word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');

  return text.split(regex).map((part, i) =>
    regex.test(part) ? <mark key={i}>{part}</mark> : part
  );
};

const App = () => {
  // State for all CSV data
  const [creditCards, setCreditCards] = useState([]);
  const [debitCards, setDebitCards] = useState([]);
  const [filteredCards, setFilteredCards] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState("");
  const [clearTripOffers, setClearTripOffers] = useState([]);
  const [easeMyTripOffers, setEaseMyTripOffers] = useState([]);
  const [makeMyTripOffers, setMakeMyTripOffers] = useState([]);
  const [goibiboOffers, setGoibiboOffers] = useState([]);
  const [yatraOffers, setYatraOffers] = useState([]);
  const [ixigoOffers, setIxigoOffers] = useState([]);
  const [hotelOffers, setHotelOffers] = useState([]);
  const [updatedCreditCards, setUpdatedCreditCards] = useState([]);
  const [noOffers, setNoOffers] = useState(false);
  const [showNoMatchMessage, setShowNoMatchMessage] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [allCards, setAllCards] = useState([]);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  
  // Function to copy coupon code
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    });
  };
  
  useEffect(() => {
  setShowScrollButton(hasAnyOffers());
}, [selectedCard]);

// Add this scroll handler function
const handleScrollDown = () => {
  window.scrollBy({
    top: window.innerHeight,
    behavior: "smooth"
  });
};

useEffect(() => {
  const checkIsMobile = () => {
    setIsMobile(window.innerWidth <= 768);
  };
   // Initial check
  checkIsMobile();
  
  // Add resize listener
  window.addEventListener('resize', checkIsMobile);
  
  // Cleanup
  return () => window.removeEventListener('resize', checkIsMobile);
}, []);

  // Function to handle input change in the search box
  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    setShowNoMatchMessage(false);

    if (typingTimeout) clearTimeout(typingTimeout);

    if (!value) {
      setFilteredCards([]);
      setSelectedCard("");
      return;
    }

    if (selectedCard && value !== selectedCard) {
      setSelectedCard("");
    }

    // Fuzzy matching for credit cards
    const creditResults = creditCards
      .map(card => ({
        type: "credit",
        card,
        score: getMatchScore(value, card)
      }))
      .filter(item => item.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Fuzzy matching for debit cards
    const debitResults = debitCards
      .map(card => ({
        type: "debit",
        card,
        score: getMatchScore(value, card)
      }))
      .filter(item => item.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const combinedResults = [];
    
    if (creditResults.length > 0) {
      combinedResults.push({ type: "heading", label: "Credit Cards" });
      combinedResults.push(...creditResults);
    }
    
    if (debitResults.length > 0) {
      combinedResults.push({ type: "heading", label: "Debit Cards" });
      combinedResults.push(...debitResults);
    }

    setFilteredCards(combinedResults);

    // Show "no matches" message if no results after 1 second
    if (combinedResults.length === 0 && value.length > 2) {
      const timeout = setTimeout(() => {
        setShowNoMatchMessage(true);
      }, 1000);
      setTypingTimeout(timeout);
    }
  };

  // Function to handle when a user selects a card from the dropdown
  const handleCardSelection = (card) => {
    setSelectedCard(card);
    setQuery(card);
    setFilteredCards([]);
    setShowNoMatchMessage(false);
    if (typingTimeout) clearTimeout(typingTimeout);

const offersFound =
  getOffersForSelectedCard(clearTripOffers).length > 0 ||
  getOffersForSelectedCard(easeMyTripOffers).length > 0 ||
  getOffersForSelectedCard(makeMyTripOffers).length > 0 ||
  getOffersForSelectedCard(goibiboOffers).length > 0 ||
  getOffersForSelectedCard(yatraOffers).length > 0 ||
  getOffersForSelectedCard(ixigoOffers).length > 0 ||
  getOffersForSelectedCard(hotelOffers, true).length > 0 ||
  getUpdatedCardOffers().length > 0;

const cardExistsInAllCardsCSV = allCards.some(card => 
  getBaseCardName(normalizeCardName(card["Credit Card Name"])).toLowerCase() === selectedCard.toLowerCase()
);

// Show no offers only if card is in AllCards.csv and no offers found
setNoOffers(cardExistsInAllCardsCSV && !offersFound);


    setNoOffers(!offersFound);
  };

  useEffect(() => {
    const fetchCSVData = async () => {
      try {
        const files = [
          { name: "ClearTrip.csv", setter: setClearTripOffers },
          { name: "EaseMyTrip.csv", setter: setEaseMyTripOffers },
          { name: "MakeMyTrip.csv", setter: setMakeMyTripOffers },
          { name: "Goibibo.csv", setter: setGoibiboOffers },
          { name: "Yatra.csv", setter: setYatraOffers },
          { name: "Ixigo.csv", setter: setIxigoOffers },
          { name: "Hotel-offers.csv", setter: setHotelOffers },
          { name: "Updated_Credit_Cards_with_Image_Links.csv", setter: setUpdatedCreditCards },
          { name: "All Cards.csv", setter: setAllCards },
        ];

        let allCreditCards = new Map();
        let allDebitCards = new Map();

        for (let file of files) {
          const response = await axios.get(file.name);
          const parsedData = Papa.parse(response.data, { header: true });

          // Extract card names based on file type
          if (file.name === "Hotel-offers.csv") {
            parsedData.data.forEach((row) => {
              if (row["Applicable Debit Cards"]) {
                const cards = row["Applicable Debit Cards"]
                  .replace(/\n/g, "")
                  .split(",")
                  .map(card => normalizeCardName(card.trim()))
                  .filter(card => card.length > 0);

                cards.forEach((card) => {
                  const baseName = getBaseCardName(card);
                  allDebitCards.set(baseName.toLowerCase(), baseName);
                });
              }
            });
          } 
          else if (file.name === "Updated_Credit_Cards_with_Image_Links.csv") {
            parsedData.data.forEach((row) => {
              if (row["Eligible Credit Cards"]) {
                const card = normalizeCardName(row["Eligible Credit Cards"].trim());
                const baseName = getBaseCardName(card);
                allCreditCards.set(baseName.toLowerCase(), baseName);
              }
            });
          }
          else if (file.name === "All Cards.csv") {
  parsedData.data.forEach((row) => {
    if (row["Credit Card Name"]) {
      const card = normalizeCardName(row["Credit Card Name"].trim());
      const baseName = getBaseCardName(card);
      allCreditCards.set(baseName.toLowerCase(), baseName); // include in dropdown
    }
  });
}

          else {
            // For all other files (ClearTrip, EaseMyTrip, etc.)
            parsedData.data.forEach((row) => {
              if (row["Eligible Credit Cards"]) {
                const cards = row["Eligible Credit Cards"]
                  .split(',')
                  .map(card => normalizeCardName(card.trim()))
                  .filter(card => card.length > 0);

                cards.forEach(card => {
                  const baseName = getBaseCardName(card);
                  allCreditCards.set(baseName.toLowerCase(), baseName);
                });
              }
            });
          }
          
          // Set the offers data
          file.setter(parsedData.data);
        }

        // Convert to array and sort
        const uniqueCreditCards = Array.from(allCreditCards.values()).sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase())
        );
        const uniqueDebitCards = Array.from(allDebitCards.values()).sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase())
        );

        setCreditCards(uniqueCreditCards);
        setDebitCards(uniqueDebitCards);
      } catch (error) {
        console.error("Error loading CSV data:", error);
      }
    };

    fetchCSVData();
  }, []);

  // Get offers for selected card
  const getOffersForSelectedCard = (offers, isDebit = false) => {
    if (!selectedCard) return [];
    
    return offers.filter((offer) => {
      if (isDebit) {
        return (
          offer["Applicable Debit Cards"] &&
          offer["Applicable Debit Cards"]
            .replace(/\n/g, '')
            .split(',')
            .map((c) => getBaseCardName(normalizeCardName(c.trim())))
            .some(baseCard => 
              baseCard.toLowerCase() === selectedCard.toLowerCase()
            )
        );
      } else if (offer["Eligible Credit Cards"]) {
        // For new CSVs with "Eligible Credit Cards"
        return offer["Eligible Credit Cards"]
          .split(',')
          .map(c => getBaseCardName(normalizeCardName(c.trim())).toLowerCase())
          .includes(selectedCard.toLowerCase());
      } else if (offer["Credit Card"]) {
        // For old format
        const baseCard = getBaseCardName(normalizeCardName(offer["Credit Card"].trim()));
        return baseCard.toLowerCase() === selectedCard.toLowerCase();
      }
      return false;
    });
  };

  const getUpdatedCardOffers = () => {
    return updatedCreditCards.filter(
      (card) => card["Eligible Credit Cards"] && 
                getBaseCardName(normalizeCardName(card["Eligible Credit Cards"].trim())).toLowerCase() === 
                selectedCard.toLowerCase()
    );
  };

  // ==============================================
  // Offer Display Components for each CSV type
  // ==============================================

  // ==============================================
  // Offer Display Components for each CSV type
  // ==============================================

  // ClearTrip Offers Component
const ClearTripOffers = ({ offers }) => (
  <div className="offer-group">
    <h2>ClearTrip Offers</h2>
    <div className="offer-grid">
      {offers.map((offer, index) => {
        const variant = getNetworkVariant(offer["Eligible Credit Cards"] || offer["Credit Card"]);
        return (
          <div key={index} className="offer-card">
            <img src={offer["Offer Image"]} alt={offer["Offer Title"]} />
            <div className="offer-info">
              <h3>{offer["Offer Title"]}</h3>
              <p>{offer["Offer Description"]}</p>
              {variant && (
                <p className="network-note">
                  <strong>Note:</strong> This benefit is applicable only on <em>{variant}</em> variant
                </p>
              )}
              <div className="coupon-code">
  {splitCouponCodes(offer["Coupon Code"]).map((code, idx) => (
    <div key={idx} className="coupon-code-item">
      <span>Code: {code}</span>
      <button className="copy-icon" onClick={() => copyToClipboard(code)}>📋</button>
    </div>
  ))}
</div>
              <button className="btn" onClick={() => window.open(offer["Offer Link"], "_blank")}>View Offer</button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);


const EaseMyTripOffers = ({ offers }) => (
  <div className="offer-group">
    <h2>EaseMyTrip Offers</h2>
    <div className="offer-grid">
      {offers.map((offer, index) => {
        const variant = getNetworkVariant(offer["Eligible Credit Cards"] || offer["Credit Card"]);
        return (
          <div key={index} className="offer-card">
            <img src={offer["Offer Image"]} alt={offer["Offer Title"]} />
            <div className="offer-info">
              <h3>{offer["Offer Title"]}</h3>
              <p>{offer["Offer Description"]}</p>
              <p><strong>Booking Period:</strong> {offer["Booking Period"]}</p>
              {variant && (
                <p className="network-note">
                  <strong>Note:</strong> Applicable only on <em>{variant}</em> variant
                </p>
              )}
        <div className="coupon-code">
  {splitCouponCodes(offer["Promo Code"]).map((code, idx) => (
    <div key={idx} className="coupon-code-item">
      <span>Code: {code}</span>
      <button className="copy-icon" onClick={() => copyToClipboard(code)}>📋</button>
    </div>
  ))}
</div>
              <button className="btn" onClick={() => window.open(offer["Offer Link"], "_blank")}>View Details</button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);


  // MakeMyTrip Offers Component
const MakeMyTripOffers = ({ offers }) => (
  <div className="offer-group">
    <h2>MakeMyTrip Offers</h2>
    <div className="offer-grid">
      {offers.map((offer, index) => {
        const variant = getNetworkVariant(offer["Eligible Credit Cards"] || offer["Credit Card"]);
        return (
          <div key={index} className="offer-card">
            <img src={offer["Offer Image"]} alt={offer["Offer Title"]} />
            <div className="offer-info">
              <h3>{offer["Offer Title"]}</h3>
              <p>{offer["Offer Description"]}</p>
              <p><strong>Expires:</strong> {offer["Offer Expires"]}</p>
              {variant && (
                <p className="network-note">
                  <strong>Note:</strong> This benefit is applicable only on {variant} variant
                </p>
              )}
              <button className="btn" onClick={() => window.open(offer.Link, "_blank")}>View Offer</button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);


  // Goibibo Offers Component
const GoibiboOffers = ({ offers }) => (
  <div className="offer-group">
    <h2>Goibibo Offers</h2>
    <div className="offer-grid">
      {offers.map((offer, index) => {
        const variant = getNetworkVariant(offer["Eligible Credit Cards"] || offer["Credit Card"]);
        return (
          <div key={index} className="offer-card">
            <img src={offer["Offer Image"]} alt={offer["Offer Title"]} />
            <div className="offer-info">
              <h3>{offer["Offer Title"]}</h3>
              <p>{offer["Offer Description"]}</p>
              <p><strong>Validity:</strong> {offer["Offer Validity"]}</p>
               {variant && (
                <p className="network-note">
                  <strong>Note:</strong> This benefit is applicable only on {variant} variant
                </p>
              )}
              <button className="btn" onClick={() => window.open(offer["Offer Link"], "_blank")}>View Offer</button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);


  // Yatra Offers Component
const YatraOffers = ({ offers }) => (
  <div className="offer-group">
    <h2>Yatra Offers</h2>
    <div className="offer-grid">
      {offers.map((offer, index) => {
        const variant = getNetworkVariant(offer["Eligible Credit Cards"] || offer["Credit Card"]);
        return (
          <div key={index} className="offer-card">
            <img src={offer["Offer Image"]} alt={offer["Offer Title"]} />
            <div className="offer-info">
              <h3>{offer["Offer Title"]}</h3>
              <p><strong>Validity:</strong> {offer.Validity}</p>
             {variant && (
                <p className="network-note">
                  <strong>Note:</strong> This benefit is applicable only on {variant} variant
                </p>
              )}
             <div className="coupon-code">
  {splitCouponCodes(offer["Coupon Code"]).map((code, idx) => (
    <div key={idx} className="coupon-code-item">
      <span>Code: {code}</span>
      <button className="copy-icon" onClick={() => copyToClipboard(code)}>📋</button>
    </div>
  ))}
</div>
              <button className="btn" onClick={() => window.open(offer["Offer Link"], "_blank")}>View Offer</button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);


  // Ixigo Offers Component
const IxigoOffers = ({ offers }) => (
  <div className="offer-group">
    <h2>Ixigo Offers</h2>
    <div className="offer-grid">
      {offers.map((offer, index) => {
        const variant = getNetworkVariant(offer["Eligible Credit Cards"] || offer["Credit Card"]);
        return (
          <div key={index} className="offer-card">
            <img src={offer["Offer Image"]} alt={offer["Offer Title"]} />
            <div className="offer-info">
              <h3>{offer["Offer Title"]}</h3>
              <p><strong>Expiry:</strong> {offer["Offer Expiry Date"]}</p>
               {variant && (
                <p className="network-note">
                  <strong>Note:</strong> This benefit is applicable only on {variant} variant
                </p>
              )}
          <div className="coupon-code">
  {splitCouponCodes(offer["Promo Code"]).map((code, idx) => (
    <div key={idx} className="coupon-code-item">
      <span>Code: {code}</span>
      <button className="copy-icon" onClick={() => copyToClipboard(code)}>📋</button>
    </div>
  ))}
</div>
              <button className="btn" onClick={() => window.open(offer["Offer Link"], "_blank")}>View Details</button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);


  // Hotel Debit Card Offers Component
const HotelDebitOffers = ({ offers }) => (
  <div className="offer-group">
    <h2>Hotel Debit Card Offers</h2>
    <div className="offer-grid">
      {offers.map((offer, index) => {
        const variant = getNetworkVariant(offer["Eligible Credit Cards"] || offer["Credit Card"]);
        return (
          <div key={index} className="offer-card">
            <img src={offer.Image} alt={offer.Website} />
            <div className="offer-info">
              <h3>{offer.Website}</h3>
              <p>{offer.Offer}</p>
             {variant && (
                <p className="network-note">
                  <strong>Note:</strong> This benefit is applicable only on {variant} variant
                </p>
              )}
              <button className="btn" onClick={() => window.open(offer.Link, "_blank")}>View Details</button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);


  // Updated Credit Card Offers Component
const UpdatedCreditCardOffers = ({ offers }) => (
  <div className="offer-group">
    <h2>Permanent Credit Card Offers</h2>
    <div className="offer-grid">
      {offers.map((offer, index) => {
        const variant = getNetworkVariant(offer["Credit Card Name"]);
        return (
          <div key={index} className="offer-card">
            {offer["Credit Card Image"] && (
              <img src={offer["Credit Card Image"]} alt={offer["Credit Card Name"]} className="card-image" />
            )}
            <div className="offer-info">
              <h3>{offer["Credit Card Name"]}</h3>
              <p>{offer["Hotel Benefit"]}</p>
               {variant && (
                <p className="network-note">
                  <strong>Note:</strong> This benefit is applicable only on {variant} variant
                </p>
              )}
              <p> <strong> This is a inbuilt feature of this credit card </strong></p>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);


  // Get offers for selected card
  const selectedClearTripOffers = getOffersForSelectedCard(clearTripOffers);
  const selectedEaseMyTripOffers = getOffersForSelectedCard(easeMyTripOffers);
  const selectedMakeMyTripOffers = getOffersForSelectedCard(makeMyTripOffers);
  const selectedGoibiboOffers = getOffersForSelectedCard(goibiboOffers);
  const selectedYatraOffers = getOffersForSelectedCard(yatraOffers);
  const selectedIxigoOffers = getOffersForSelectedCard(ixigoOffers);
  const selectedDebitHotelOffers = getOffersForSelectedCard(hotelOffers, true);
  const selectedUpdatedCardOffers = getUpdatedCardOffers();

  const hasAnyOffers = () => {
    return (
      selectedClearTripOffers.length > 0 ||
      selectedEaseMyTripOffers.length > 0 ||
      selectedMakeMyTripOffers.length > 0 ||
      selectedGoibiboOffers.length > 0 ||
      selectedYatraOffers.length > 0 ||
      selectedIxigoOffers.length > 0 ||
      selectedDebitHotelOffers.length > 0 ||
      selectedUpdatedCardOffers.length > 0
    );
  };

  return (
    <div className="App" style={{ fontFamily: "'Libre Baskerville', serif" }}>
       {/* Dropdown section */}
      <div className="dropdown-container" style={{ maxWidth: '600px'}}>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Type a Credit Card..."
          className="dropdown-input"
          style={{
            width: "100%",
            fontSize: "16px",
            border: `1px solid ${showNoMatchMessage ? 'red' : '#ccc'}`,
            borderRadius: "5px",
          }}
        />
        {filteredCards.length > 0 && (
          <ul className="dropdown-list" style={{
            listStyleType: "none",
            padding: "10px",
            margin: 0,
            width: "100%",
            maxHeight: "200px",
            overflowY: "auto",
            border: "1px solid #ccc",
            borderRadius: "5px",
            backgroundColor: "#fff",
            position: "absolute",
            zIndex: 1000,
          }}>
            {filteredCards.map((item, index) =>
              item.type === "heading" ? (
                <li key={index} style={{ fontWeight: "bold", padding: "5px 10px" }}>
                  {item.label}
                </li>
              ) : (
                <li
                  key={index}
                  onClick={() => handleCardSelection(item.card)}
                  style={{
                    padding: "10px",
                    cursor: "pointer",
                    borderBottom: index !== filteredCards.length - 1 ? "1px solid #eee" : "none",
                    backgroundColor: item.score > 0.8 ? "#f8fff0" : 
                                    item.score > 0.6 ? "#fff8e1" : "#fff"
                  }}
                  onMouseOver={(e) => (e.target.style.backgroundColor = "#f0f0f0")}
                  onMouseOut={(e) => (e.target.style.backgroundColor = 
                    item.score > 0.8 ? "#f8fff0" : 
                    item.score > 0.6 ? "#fff8e1" : "#fff")}
                >
                  {highlightMatch(item.card, query)}
                  {item.score < 0.8 && (
                    <span style={{ 
                      float: "right", 
                      color: "#999", 
                      fontSize: "0.8em"
                    }}>
                      Similar
                    </span>
                  )}
                </li>
              )
            )}
          </ul>
        )}
      </div>

      {showNoMatchMessage && (
        <div style={{ color: "red", marginTop: "10px", textAlign: 'center' }}>
          No matching cards found. Please try a different name.
        </div>
      )}

    {selectedCard && !hasAnyOffers() && (
          <div style={{ color: "red", marginTop: "10px", textAlign: 'center' }}>
            No offers found for {selectedCard}
          </div>
        )}

      {/* Offers section */}
      {selectedCard && hasAnyOffers() && (
        <div className="offers-section" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
             {selectedUpdatedCardOffers.length > 0 && (
            <UpdatedCreditCardOffers offers={selectedUpdatedCardOffers} />
            
          )}

          {selectedClearTripOffers.length > 0 && (
            <ClearTripOffers offers={selectedClearTripOffers} />
          )}

          {selectedEaseMyTripOffers.length > 0 && (
            <EaseMyTripOffers offers={selectedEaseMyTripOffers} />
          )}

          {selectedMakeMyTripOffers.length > 0 && (
            <MakeMyTripOffers offers={selectedMakeMyTripOffers} />
          )}

          {selectedGoibiboOffers.length > 0 && (
            <GoibiboOffers offers={selectedGoibiboOffers} />
          )}

          {selectedYatraOffers.length > 0 && (
            <YatraOffers offers={selectedYatraOffers} />
          )}

          {selectedIxigoOffers.length > 0 && (
            <IxigoOffers offers={selectedIxigoOffers} />
          )}

          {selectedDebitHotelOffers.length > 0 && (
            <HotelDebitOffers offers={selectedDebitHotelOffers} />
          )}
          
      
        </div>
        
      )}
 {selectedCard && !hasAnyOffers() && !showNoCardMessage ? null : (
        <p className="bottom-disclaimer"> <h3>Disclaimer</h3> All offers, coupons, and discounts listed on our platform are provided for informational purposes only. We do not guarantee the accuracy, availability, or validity of any offer. Users are advised to verify the terms and conditions with the respective merchants before making any purchase. We are not responsible for any discrepancies, expired offers, or losses arising from the use of these coupons.</p>
     )}
{showScrollButton && (
  <button 
    onClick={handleScrollDown}
    style={{
      position: 'fixed',
      right: '20px',
      bottom: isMobile ? '20px' : '150px',
      padding: isMobile ? '12px 15px' : '10px 20px',
      backgroundColor: '#1e7145',
      color: 'white',
      border: 'none',
      borderRadius: isMobile ? '50%' : '8px', // ← rectangular for desktop
      cursor: 'pointer',
      fontSize: '18px',
      zIndex: 1000,
      boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
      width: isMobile ? '50px' : '140px',
      height: isMobile ? '50px' : '50px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom:'450px',
    }}
  >
    {isMobile ? '↓' : 'Scroll Down'}
  </button>
)}

    </div>
  );
};

export default App;