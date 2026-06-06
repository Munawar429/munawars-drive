const { expect } = require("chai");
const hre = require("hardhat");

const { ethers } = hre;

describe("Web3Drive Smart Contract", function () {
  let Web3Drive;
  let web3Drive;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    // Get signers
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy contract
    Web3Drive = await ethers.getContractFactory("Web3Drive");
    web3Drive = await Web3Drive.deploy();
    await web3Drive.waitForDeployment();
  });

  describe("File Uploads", function () {
    it("Should upload a file successfully and emit event", async function () {
      const ipfsHash = "QmXoypizjW3WknFixtdKL9bL72td2WSWNB2qXExN68hoH9";
      const fileName = "test-doc.pdf";
      const fileType = "application/pdf";
      const fileSize = 1024 * 5; // 5KB
      const encryptedKey = "encryptedAESKeyExample";
      const fileHash = "sha256HashExampleFileIntegrityToCheck";
      const isPublic = false;

      const tx = await web3Drive.uploadFile(
        ipfsHash,
        fileName,
        fileType,
        fileSize,
        encryptedKey,
        fileHash,
        isPublic
      );
      
      const receipt = await tx.wait();
      
      // Check event emitted
      await expect(tx)
        .to.emit(web3Drive, "FileUploaded");

      const file = await web3Drive.getFile(1);
      expect(file.id).to.equal(1);
      expect(file.fileName).to.equal(fileName);
      expect(file.owner).to.equal(owner.address);
      expect(file.isPublic).to.be.false;
      expect(file.isDeleted).to.be.false;
    });

    it("Should fail if file parameters are invalid", async function () {
      await expect(
        web3Drive.uploadFile(
          "", // Empty CID
          "test.txt",
          "text/plain",
          100,
          "key",
          "hash",
          false
        )
      ).to.be.revertedWith("Web3Drive: IPFS hash is required");

      await expect(
        web3Drive.uploadFile(
          "QmXYZ",
          "", // Empty name
          "text/plain",
          100,
          "key",
          "hash",
          false
        )
      ).to.be.revertedWith("Web3Drive: File name is required");
    });
  });

  describe("Access Controls & Sharing", function () {
    beforeEach(async function () {
      // Upload a private file
      await web3Drive.uploadFile(
        "QmPrivate",
        "private.txt",
        "text/plain",
        100,
        "key",
        "hash",
        false
      );
    });

    it("Should allow owner to view file, but block other users", async function () {
      const file = await web3Drive.getFile(1);
      expect(file.owner).to.equal(owner.address);

      // Connect as user1 and try to access
      await expect(
        web3Drive.connect(user1).getFile(1)
      ).to.be.revertedWith("Web3Drive: Access denied");
    });

    it("Should share file with user1 successfully", async function () {
      await expect(web3Drive.shareFile(1, user1.address))
        .to.emit(web3Drive, "FileShared")
        .withArgs(1, owner.address, user1.address);

      // Now user1 should be able to fetch details
      const file = await web3Drive.connect(user1).getFile(1);
      expect(file.id).to.equal(1);

      // user2 still denied
      await expect(
        web3Drive.connect(user2).getFile(1)
      ).to.be.revertedWith("Web3Drive: Access denied");
    });

    it("Should revoke access successfully", async function () {
      await web3Drive.shareFile(1, user1.address);
      
      // Verify user1 has access
      expect(await web3Drive.checkAccess(1, user1.address)).to.be.true;

      await expect(web3Drive["revokeAccess(uint256,address)"](1, user1.address))
        .to.emit(web3Drive, "AccessRevoked")
        .withArgs(1, owner.address, user1.address);

      // Access denied again
      expect(await web3Drive.checkAccess(1, user1.address)).to.be.false;
      await expect(
        web3Drive.connect(user1).getFile(1)
      ).to.be.revertedWith("Web3Drive: Access denied");
    });

    it("Should revoke access by CID successfully", async function () {
      await web3Drive.shareFile(1, user1.address);
      
      // Verify user1 has access
      expect(await web3Drive.checkAccess(1, user1.address)).to.be.true;

      // Revoke by CID
      const ipfsHash = "QmPrivate";
      await expect(web3Drive["revokeAccess(string,address)"](ipfsHash, user1.address))
        .to.emit(web3Drive, "AccessRevoked")
        .withArgs(1, owner.address, user1.address);

      // Access denied again
      expect(await web3Drive.checkAccess(1, user1.address)).to.be.false;
      await expect(
        web3Drive.connect(user1).getFile(1)
      ).to.be.revertedWith("Web3Drive: Access denied");
    });

    it("Should allow access if file visibility is public", async function () {
      // Toggle visibility
      await expect(web3Drive.toggleVisibility(1, true))
        .to.emit(web3Drive, "FileVisibilityChanged")
        .withArgs(1, owner.address, true);

      // Now user1 and user2 can access it
      const fileByUser1 = await web3Drive.connect(user1).getFile(1);
      expect(fileByUser1.isPublic).to.be.true;
    });
  });

  describe("File Integrity & Deletion", function () {
    const fileHashVal = "d5a82c40a7cf5288e404bf702a4bf7ad7b4a2e2f386c6bbf8e41bcfa180735be";

    beforeEach(async function () {
      await web3Drive.uploadFile(
        "QmHash",
        "file.txt",
        "text/plain",
        100,
        "key",
        fileHashVal,
        false
      );
    });

    it("Should verify correct file hash and report incorrect ones", async function () {
      const [isValid, fileOwner, ts] = await web3Drive.verifyFileIntegrity(1, fileHashVal);
      expect(isValid).to.be.true;
      expect(fileOwner).to.equal(owner.address);

      const [isInvalid] = await web3Drive.verifyFileIntegrity(1, "fakeHashHere");
      expect(isInvalid).to.be.false;
    });

    it("Should delete file successfully and deny access to everyone", async function () {
      await expect(web3Drive.deleteFile(1))
        .to.emit(web3Drive, "FileDeleted")
        .withArgs(1, owner.address);

      // Owner denied
      await expect(web3Drive.getFile(1)).to.be.revertedWith("Web3Drive: File has been deleted");
      
      // Integrity check returns false
      const [isValid] = await web3Drive.verifyFileIntegrity(1, fileHashVal);
      expect(isValid).to.be.false;
    });
  });

  describe("Retrieval lists", function () {
    it("Should retrieve separate lists for owned and shared files", async function () {
      // Owner uploads 2 files
      await web3Drive.uploadFile("Qm1", "doc1.txt", "text/plain", 100, "k1", "h1", false);
      await web3Drive.uploadFile("Qm2", "doc2.txt", "text/plain", 200, "k2", "h2", false);

      // User1 uploads 1 file
      await web3Drive.connect(user1).uploadFile("Qm3", "doc3.txt", "text/plain", 300, "k3", "h3", false);

      // Owner shares file 1 with User1
      await web3Drive.shareFile(1, user1.address);

      // Check owner's files
      const ownerFiles = await web3Drive.getMyFiles();
      expect(ownerFiles.length).to.equal(2);
      expect(ownerFiles[0].id).to.equal(1);
      expect(ownerFiles[1].id).to.equal(2);

      // Check User1 files
      const user1Files = await web3Drive.connect(user1).getMyFiles();
      expect(user1Files.length).to.equal(1);
      expect(user1Files[0].id).to.equal(3);

      // Check files shared with User1
      const user1Shared = await web3Drive.connect(user1).getSharedWithMe();
      expect(user1Shared.length).to.equal(1);
      expect(user1Shared[0].id).to.equal(1);
      expect(user1Shared[0].fileName).to.equal("doc1.txt");
    });
  });
});
