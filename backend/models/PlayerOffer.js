const pool = require('../config/database');

class PlayerOffer {
  // Get all offers for a player by their user_id
  // Returns array of offer objects parsed from the offers TEXT column
  static async getByUserId(userId) {
    const result = await pool.query(
      'SELECT offers FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].offers) {
      return [];
    }

    return this.parseOffers(result.rows[0].offers);
  }

  // Get offers by username (for viewing other profiles)
  static async getByUsername(username) {
    const result = await pool.query(
      'SELECT offers FROM player_profiles WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0 || !result.rows[0].offers) {
      return [];
    }

    return this.parseOffers(result.rows[0].offers);
  }

  // Add a new offer (prepends to existing offers)
  static async create(userId, offerData) {
    // Get current offers
    const result = await pool.query(
      'SELECT offers FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Player profile not found');
    }

    const currentOffers = result.rows[0].offers || '';

    // Prepend new offer (most recent first)
    const newOffers = currentOffers
      ? `${offerData}|${currentOffers}`
      : offerData;

    // Update the offers column
    await pool.query(
      'UPDATE player_profiles SET offers = $1 WHERE user_id = $2',
      [newOffers, userId]
    );

    return { offer_data: offerData };
  }

  // Update an offer by index
  static async update(userId, offerIndex, newOfferData) {
    const result = await pool.query(
      'SELECT offers FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].offers) {
      return null;
    }

    const offersArray = result.rows[0].offers.split('|');

    if (offerIndex < 0 || offerIndex >= offersArray.length) {
      return null;
    }

    // Update the offer at the specified index
    offersArray[offerIndex] = newOfferData;
    const newOffers = offersArray.join('|');

    await pool.query(
      'UPDATE player_profiles SET offers = $1 WHERE user_id = $2',
      [newOffers, userId]
    );

    return { offer_data: newOfferData };
  }

  // Delete an offer by index
  static async delete(userId, offerIndex) {
    const result = await pool.query(
      'SELECT offers FROM player_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].offers) {
      return null;
    }

    const offersArray = result.rows[0].offers.split('|');

    if (offerIndex < 0 || offerIndex >= offersArray.length) {
      return null;
    }

    // Remove the offer at the specified index
    offersArray.splice(offerIndex, 1);
    const newOffers = offersArray.join('|');

    await pool.query(
      'UPDATE player_profiles SET offers = $1 WHERE user_id = $2',
      [newOffers || null, userId]
    );

    return { deleted: true };
  }

  // Helper to parse offers string into array of objects
  static parseOffers(offersString) {
    if (!offersString) return [];

    return offersString.split('|').map((offer, index) => ({
      id: index,
      offer_data: offer.trim()
    }));
  }
}

module.exports = PlayerOffer;
