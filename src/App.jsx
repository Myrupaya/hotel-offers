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
      {/* Navbar - unchanged */}
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

      {/* Title in white container box */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        margin: '20px auto',
        maxWidth: '1200px',
        borderRadius: '5px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ color: 'black', textAlign: 'center', margin: 0 }}>Hotel Offers</h1>
      </div>

      {/* 50-50 split row */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '20px'
      }}>
        {/* First section with title and paragraph */}
        <div style={{
          flex: '1',
          minWidth: '300px',
          padding: '20px'
        }}>
          <h2 style={{ color: '#333' }}>Find the Best Hotel Offers</h2>
          <p style={{ lineHeight: '1.6', color: '#666' }}>
            Discover exclusive discounts and cashback offers on hotel bookings when you use your credit or debit card. 
            Our platform aggregates the best hotel offers from multiple travel portals to help you save money on your 
            next stay. Simply search for your card to see available offers.
          </p>
        </div>
        
        {/* Second section with image */}
        <div style={{
          flex: '1',
          minWidth: '300px',
          padding: '20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <img 
            src="" 
            alt="Hotel offers" 
            style={{ 
              maxWidth: '100%', 
              height: 'auto',
              borderRadius: '5px',
              boxShadow: '0 3px 10px rgba(0,0,0,0.2)'
            }} 
          />
        </div>
      </div>

      {/* Dropdown section - unchanged */}
      <div className="dropdown-container" style={{ maxWidth: '600px', margin: '30px auto' }}>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Type a Credit/Debit Card..."
          className="dropdown-input"
          style={{
            width: "100%",
            padding: "12px",
            fontSize: "16px",
            border: "1px solid #ccc",
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
                <li key={index} style={{ padding: "10px", fontWeight: "bold" }}>
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

      {/* Offers section - unchanged */}
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

      {/* FAQ section with 3 columns */}
      <div style={{
        maxWidth: '1200px',
        margin: '50px auto',
        padding: '20px'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>Frequently Asked Questions</h2>
        
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '20px',
          justifyContent: 'space-between'
        }}>
          {/* Column 1 */}
          <div style={{
            flex: '1',
            minWidth: '300px',
            padding: '20px',
            borderRadius: '5px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: '#333', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
              How do I use these hotel offers?
            </h3>
            <p style={{ lineHeight: '1.6', color: '#666' }}>
              Search for your credit or debit card to see available hotel offers. When you find an offer you want to use, 
              click "View Details" to be redirected to the booking website. Make sure to use the same card during checkout 
              to avail the discount or cashback.
            </p>
          </div>
          
          {/* Column 2 */}
          <div style={{
            flex: '1',
            minWidth: '300px',
            padding: '20px',
            borderRadius: '5px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: '#333', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
              Are these offers valid for international hotels?
            </h3>
            <p style={{ lineHeight: '1.6', color: '#666' }}>
              Most offers are valid for both domestic and international hotels, but some may have restrictions. 
              Please check the terms and conditions of each offer before booking. The offer details will specify 
              if there are any limitations on hotel locations or chains.
            </p>
          </div>
          
          {/* Column 3 */}
          <div style={{
            flex: '1',
            minWidth: '300px',
            padding: '20px',
            borderRadius: '5px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: '#333', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
              How often are new hotel offers added?
            </h3>
            <p style={{ lineHeight: '1.6', color: '#666' }}>
              We update our database regularly as new offers become available. Hotel offers often change seasonally, 
              especially around holidays and peak travel times. We recommend checking back frequently before 
              booking your stay to ensure you get the best available deal.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Styles unchanged from original
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