import React, { useState, useEffect } from "react";
import axios from "axios";
import Papa from "papaparse";
import "./App.css";

const App = () => {
  const [creditCards, setCreditCards] = useState([]);
  const [debitCards, setDebitCards] = useState([]);
  const [filteredCards, setFilteredCards] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState("");
  const [easeOffers, setEaseOffers] = useState([]);
  const [yatraOffers, setYatraOffers] = useState([]);
  const [clearOffers, setClearOffers] = useState([]);
  const [ixigoOffers, setIxigoOffers] = useState([]);
  const [hotelOffers, setHotelOffers] = useState([]);
  const [updatedCreditCards, setUpdatedCreditCards] = useState([]);
  const [noOffers, setNoOffers] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchCSVData = async () => {
      try {
        const files = [
          { name: "EASE HOTEL.csv", setter: setEaseOffers },
          { name: "YATRA HOTEL.csv", setter: setYatraOffers },
          { name: "CLEAR HOTEL.csv", setter: setClearOffers },
          { name: "IXIGO HOTEL.csv", setter: setIxigoOffers },
          { name: "Hotel-offers.csv", setter: setHotelOffers },
          { name: "Updated_Credit_Cards_with_Image_Links.csv", setter: setUpdatedCreditCards },
        ];

        let allCreditCards = new Set();
        let allDebitCards = new Set();

        for (let file of files) {
          const response = await axios.get(file.name);
          const parsedData = Papa.parse(response.data, { header: true });

          if (file.name === "Hotel-offers.csv") {
            parsedData.data.forEach((row) => {
              if (row["Applicable Debit Cards"]) {
                // Clean up the card names by removing extra whitespace and newlines
                const cards = row["Applicable Debit Cards"]
                  .replace(/\n/g, '')  // Remove newlines
                  .split(',')
                  .map(card => card.trim())
                  .filter(card => card.length > 0);
                
                cards.forEach((card) => {
                  allDebitCards.add(card);
                });
              }
            });
            file.setter(parsedData.data);
          } 
          else if (file.name === "Updated_Credit_Cards_with_Image_Links.csv") {
            parsedData.data.forEach((row) => {
              if (row["Credit Card Name"]) {
                allCreditCards.add(row["Credit Card Name"].trim());
              }
            });
            file.setter(parsedData.data);
          }
          else {
            parsedData.data.forEach((row) => {
              if (row["Credit Card"]) {
                allCreditCards.add(row["Credit Card"].trim());
              }
            });
            file.setter(parsedData.data);
          }
        }

        setCreditCards(Array.from(allCreditCards).sort());
        setDebitCards(Array.from(allDebitCards).sort());
      } catch (error) {
        console.error("Error loading CSV data:", error);
      }
    };

    fetchCSVData();
  }, []);

  const handleInputChange = (event) => {
    const value = event.target.value;
    setQuery(value);

    if (value) {
      const searchTerms = value.toLowerCase().split(/\s+/).filter(Boolean);
      
      const filteredCredit = creditCards.filter((card) => {
        const lowerCard = card.toLowerCase();
        return searchTerms.every(term => lowerCard.includes(term));
      });

      const filteredDebit = debitCards.filter((card) => {
        const lowerCard = card.toLowerCase();
        return searchTerms.every(term => lowerCard.includes(term));
      });

      const combinedResults = [];
      if (filteredCredit.length > 0) {
        combinedResults.push({ type: "heading", label: "Credit Cards" });
        combinedResults.push(...filteredCredit.map((card) => ({ type: "credit", card })));
      }
      if (filteredDebit.length > 0) {
        combinedResults.push({ type: "heading", label: "Debit Cards" });
        combinedResults.push(...filteredDebit.map((card) => ({ type: "debit", card })));
      }

      setFilteredCards(combinedResults);

      if (filteredCredit.length === 0 && filteredDebit.length === 0) {
        setNoOffers(true);
      } else {
        setNoOffers(false);
      }
    } else {
      setFilteredCards([]);
      setNoOffers(false);
      setSelectedCard("");
    }
  };

  const handleCardSelection = (card) => {
    setSelectedCard(card);
    setQuery(card);
    setFilteredCards([]);
    setNoOffers(false);
  };

  const getOffersForSelectedCard = (offers, isDebit = false) => {
    return offers.filter((offer) => {
      if (isDebit) {
        return (
          offer["Applicable Debit Cards"] &&
          offer["Applicable Debit Cards"]
            .replace(/\n/g, '')  // Remove newlines
            .split(',')
            .map((c) => c.trim())
            .some(card => 
              card.toLowerCase().includes(selectedCard.toLowerCase()) ||
              selectedCard.toLowerCase().includes(card.toLowerCase())
            )
        );
      } else {
        return offer["Credit Card"] && 
               offer["Credit Card"].trim().toLowerCase() === selectedCard.toLowerCase();
      }
    });
  };

  const getUpdatedCardOffers = () => {
    return updatedCreditCards.filter(
      (card) => card["Credit Card Name"] && 
                card["Credit Card Name"].trim().toLowerCase() === selectedCard.toLowerCase()
    );
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
  };

  const selectedEaseOffers = getOffersForSelectedCard(easeOffers);
  const selectedYatraOffers = getOffersForSelectedCard(yatraOffers);
  const selectedClearOffers = getOffersForSelectedCard(clearOffers);
  const selectedIxigoOffers = getOffersForSelectedCard(ixigoOffers);
  const selectedDebitHotelOffers = getOffersForSelectedCard(hotelOffers, true);
  const selectedUpdatedCardOffers = getUpdatedCardOffers();

  return (
    <div className="App" style={{ fontFamily: "'Libre Baskerville', serif" }}>
      <nav style={styles.navbar}>
        <div style={styles.logoContainer}>
          <a href="https://www.myrupaya.in/">
            <img
              src="https://static.wixstatic.com/media/f836e8_26da4bf726c3475eabd6578d7546c3b2~mv2.jpg/v1/crop/x_124,y_0,w_3152,h_1458/fill/w_909,h_420,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/dark_logo_white_background.jpg"
              alt="MyRupaya Logo"
              style={styles.logo}
            />
          </a>
          <div
            style={{
              ...styles.linksContainer,
              ...(isMobileMenuOpen ? styles.mobileMenuOpen : {}),
            }}
          >
            <a href="https://www.myrupaya.in/" style={styles.link}>
              Home
            </a>
          </div>
        </div>
      </nav>

      <h1>Hotel Offers</h1>
      <div className="dropdown-container">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Type a Credit/Debit Card..."
          className="dropdown-input"
        />
        {filteredCards.length > 0 && (
          <ul className="dropdown-list">
            {filteredCards.map((item, index) =>
              item.type === "heading" ? (
                <li key={index} className="dropdown-heading">
                  <strong>{item.label}</strong>
                </li>
              ) : (
                <li
                  key={index}
                  onClick={() => handleCardSelection(item.card)}
                  className="dropdown-item"
                >
                  {item.card}
                </li>
              )
            )}
          </ul>
        )}
      </div>

      {noOffers && (
        <div style={{ color: "red", marginTop: "10px" }}>
          No offers found for this card.
        </div>
      )}

      {selectedCard && !noOffers && (
        <div className="offers-section">
          {selectedUpdatedCardOffers.length > 0 && (
            <div className="offer-group">
              <h2>Some permanent offers on the selected credit card</h2>
              <div className="offer-grid">
                {selectedUpdatedCardOffers.map((offer, index) => (
                  <div key={index} className="offer-card">
                    {offer["Credit Card Image"] && (
                      <img 
                        src={offer["Credit Card Image"]} 
                        alt={offer["Credit Card Name"]} 
                        className="card-image"
                      />
                    )}
                    <div className="offer-info">
                      <h3>{offer["Credit Card Name"]}</h3>
                      <p>{offer["Hotel Benefit"]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedEaseOffers.length > 0 && (
            <div className="offer-group">
              <h2>EaseMyTrip Offers</h2>
              <div className="offer-grid">
                {selectedEaseOffers.map((offer, index) => (
                  <div key={index} className="offer-card">
                    <img src={offer.Image} alt={offer.Title} />
                    <div className="offer-info">
                      <h3>{offer.Title}</h3>
                      <p>{offer.Offer}</p>
                      <button onClick={() => window.open(offer.Link, "_blank")}>View Details</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedYatraOffers.length > 0 && (
            <div className="offer-group">
              <h2>Yatra Offers</h2>
              <div className="offer-grid">
                {selectedYatraOffers.map((offer, index) => (
                  <div key={index} className="offer-card">
                    <img src={offer.Image} alt={offer.Title} />
                    <div className="offer-info">
                      <h3>{offer.Title}</h3>
                      <p>{offer.Offer}</p>
                      <button onClick={() => window.open(offer.Link, "_blank")}>View Details</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedClearOffers.length > 0 && (
            <div className="offer-group">
              <h2>ClearTrip Offers</h2>
              <div className="offer-grid">
                {selectedClearOffers.map((offer, index) => (
                  <div key={index} className="offer-card">
                    <img src={offer.Image} alt={offer.Title} />
                    <div className="offer-info">
                      <h3>{offer.Title}</h3>
                      <p>{offer.Offer}</p>
                      <button onClick={() => window.open(offer.Link, "_blank")}>View Details</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedIxigoOffers.length > 0 && (
            <div className="offer-group">
              <h2>Ixigo Offers</h2>
              <div className="offer-grid">
                {selectedIxigoOffers.map((offer, index) => (
                  <div key={index} className="offer-card">
                    <img src={offer.Image} alt={offer.Title} />
                    <div className="offer-info">
                      <h3>{offer.Title}</h3>
                      <p>{offer.Offer}</p>
                      <button onClick={() => window.open(offer.Link, "_blank")}>View Details</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedDebitHotelOffers.length > 0 && (
            <div className="offer-group">
              <h2>Hotel Debit Card Offers</h2>
              <div className="offer-grid">
                {selectedDebitHotelOffers.map((offer, index) => (
                  <div key={index} className="offer-card">
                    <img src={offer.Image} alt={offer.Website} />
                    <div className="offer-info">
                      <h3>{offer.Website}</h3>
                      <p>{offer.Offer}</p>
                      <button onClick={() => window.open(offer.Link, "_blank")}>View Details</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const styles = {
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 20px",
    backgroundColor: "#CDD1C1",
  },
  logoContainer: {
    display: "flex",
    alignItems: "center",
  },
  logo: {
    width: "100px",
    height: "100px",
    marginRight: "20px",
  },
  linksContainer: {
    display: "flex",
    gap: "35px",
    flexWrap: "wrap",
    marginLeft: "40px",
  },
  link: {
    textDecoration: "none",
    color: "black",
    fontSize: "18px",
    fontFamily: "Arial, sans-serif",
    transition: "color 0.3s ease",
  },
  mobileMenuOpen: {
    display: "block",
  },
};

export default App;