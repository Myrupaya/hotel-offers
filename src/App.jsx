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
  const [makeOffers, setMakeOffers] = useState([]);
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
        { name: "MakeMyTrip (3).csv", setter: setMakeOffers },
        { name: "Updated_Credit_Cards_with_Image_Links.csv", setter: setUpdatedCreditCards },
      ];

      let allCreditCards = new Map();
      let allDebitCards = new Map();

      for (let file of files) {
        const response = await axios.get(file.name);
        const parsedData = Papa.parse(response.data, { header: true });

        if (file.name === "Hotel-offers.csv") {
          parsedData.data.forEach((row) => {
            if (row["Applicable Debit Cards"]) {
              const cards = row["Applicable Debit Cards"]
                .replace(/\n/g, "")
                .split(",")
                .map(card => card.trim())
                .filter(card => card.length > 0);

              cards.forEach((card) => {
                allDebitCards.set(card.toLowerCase(), card); // lowercase key, original value
              });
            }
          });
          file.setter(parsedData.data);
        } 
        else if (file.name === "Updated_Credit_Cards_with_Image_Links.csv") {
          parsedData.data.forEach((row) => {
            if (row["Credit Card Name"]) {
              const card = row["Credit Card Name"].trim();
              allCreditCards.set(card.toLowerCase(), card);
            }
          });
          file.setter(parsedData.data);
        }
        else if (file.name === "MakeMyTrip (3).csv") {
          parsedData.data.forEach((row) => {
            if (row["Credit Card"]) {
              const card = row["Credit Card"].trim();
              allCreditCards.set(card.toLowerCase(), card);
            }
          });
          file.setter(parsedData.data);
        }
        else {
          parsedData.data.forEach((row) => {
            if (row["Credit Card"]) {
              const card = row["Credit Card"].trim();
              allCreditCards.set(card.toLowerCase(), card);
            }
          });
          file.setter(parsedData.data);
        }
      }

      // Convert to array and sort while preserving original case
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
            .replace(/\n/g, '')
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
  const selectedMakeOffers = getOffersForSelectedCard(makeOffers);
  const selectedClearOffers = getOffersForSelectedCard(clearOffers);
  const selectedIxigoOffers = getOffersForSelectedCard(ixigoOffers);
  const selectedDebitHotelOffers = getOffersForSelectedCard(hotelOffers, true);
  const selectedUpdatedCardOffers = getUpdatedCardOffers();

  return (
    <div className="App" style={{ fontFamily: "'Libre Baskerville', serif" }}>

      {/* Dropdown section */}
      <div className="dropdown-container" style={{ maxWidth: '600px'}}>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Type a Credit/Debit Card..."
          className="dropdown-input"
          style={{
            width: "100%",
            fontSize: "16px",
            border: "1px solid #ccc",
            borderRadius: "5px",
          }}
        />
        {filteredCards.length > 0 && (
          <ul className="dropdown-list" style={{
            listStyleType: "none",
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
                <li key={index} style={{fontWeight: "bold" }}>
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
                  }}
                  onMouseOver={(e) => (e.target.style.backgroundColor = "#f0f0f0")}
                  onMouseOut={(e) => (e.target.style.backgroundColor = "transparent")}
                >
                  {item.card}
                </li>
              )
            )}
          </ul>
        )}
      </div>

      {noOffers && (
        <div style={{ color: "red", marginTop: "10px", textAlign: 'center' }}>
          No offers found for this card.
        </div>
      )}

      {/* Offers section */}
      {selectedCard && !noOffers && (
        <div className="offers-section" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
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

          {selectedMakeOffers.length > 0 && (
            <div className="offer-group">
              <h2>MakeMyTrip Offers</h2>
              <div className="offer-grid">
                {selectedMakeOffers.map((offer, index) => (
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

export default App;
