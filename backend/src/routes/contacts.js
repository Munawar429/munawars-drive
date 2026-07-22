import express from "express";
import { ethers } from "ethers";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";
import { jsonDb } from "../utils/jsonDb.js";
import { getDbMode } from "../config/db.js";

const router = express.Router();

// Helper to save user address book in dual DB mode
const saveUserAddressBook = async (user, addressBook) => {
  user.addressBook = addressBook;
  if (getDbMode()) {
    if (typeof user.save === "function") {
      await user.save();
    } else {
      await User.findByIdAndUpdate(user._id || user.id, { addressBook });
    }
  } else {
    await jsonDb.users.findByIdAndUpdate(user._id || user.id, { addressBook });
  }
  return addressBook;
};

/**
 * @route GET /api/contacts
 * @desc Get all contacts in user's address book
 */
router.get("/", protect, async (req, res) => {
  try {
    const user = req.user;
    const contacts = user.addressBook || [];
    return res.json({ success: true, contacts });
  } catch (error) {
    console.error("Fetch Contacts Error:", error);
    return res.status(500).json({ success: false, message: "Server error fetching contacts" });
  }
});

/**
 * @route POST /api/contacts
 * @desc Add a new contact to address book
 */
router.post("/", protect, async (req, res) => {
  try {
    const { name, address } = req.body;

    if (!name || !address) {
      return res.status(400).json({ success: false, message: "Name and wallet address are required." });
    }

    const trimmedName = name.trim();
    const trimmedAddress = address.trim().toLowerCase();

    if (!ethers.isAddress(trimmedAddress)) {
      return res.status(400).json({ success: false, message: "Invalid Ethereum wallet address format." });
    }

    const user = req.user;
    let addressBook = user.addressBook || [];

    // Check if address already exists in contacts
    const exists = addressBook.find(c => c.address.toLowerCase() === trimmedAddress);
    if (exists) {
      return res.status(400).json({ success: false, message: `Contact with address ${trimmedAddress.slice(0,6)}... already exists in your address book.` });
    }

    const newContact = {
      id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
      name: trimmedName,
      address: trimmedAddress,
      createdAt: new Date().toISOString()
    };

    addressBook.push(newContact);
    await saveUserAddressBook(user, addressBook);

    return res.status(201).json({
      success: true,
      message: "Contact added successfully",
      contact: newContact,
      contacts: addressBook
    });
  } catch (error) {
    console.error("Add Contact Error:", error);
    return res.status(500).json({ success: false, message: "Server error adding contact" });
  }
});

/**
 * @route DELETE /api/contacts/:id
 * @desc Remove a contact from address book
 */
router.delete("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    let addressBook = user.addressBook || [];

    const updatedAddressBook = addressBook.filter(c => String(c.id) !== String(id));

    if (updatedAddressBook.length === addressBook.length) {
      return res.status(404).json({ success: false, message: "Contact not found." });
    }

    await saveUserAddressBook(user, updatedAddressBook);

    return res.json({
      success: true,
      message: "Contact deleted successfully",
      contacts: updatedAddressBook
    });
  } catch (error) {
    console.error("Delete Contact Error:", error);
    return res.status(500).json({ success: false, message: "Server error deleting contact" });
  }
});

export default router;
