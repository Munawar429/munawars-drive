// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Web3Drive
 * @dev Decentralized, access-controlled file sharing and storage indexer.
 */
contract Web3Drive {
    
    struct FileMetadata {
        uint256 id;
        string ipfsHash;      // IPFS CID
        string fileName;
        string fileType;
        uint256 fileSize;
        string encryptedKey;  // AES key encrypted with owner's public key (or derived seed)
        string fileHash;      // Original unencrypted file SHA-256 hash (integrity checker)
        address owner;
        uint256 timestamp;
        bool isPublic;
        bool isDeleted;
    }

    // Storage
    uint256 public fileCount;
    mapping(uint256 => FileMetadata) private files;
    
    // User file indices (on-chain indexing)
    mapping(address => uint256[]) private userFiles;
    // Files shared with a specific user (on-chain indexing)
    mapping(address => uint256[]) private sharedFiles;
    
    // Access control mapping: fileId => user => hasAccess
    mapping(uint256 => mapping(address => bool)) private fileAccess;

    // Mapping from IPFS CID (hash) to file ID
    mapping(string => uint256) private cidToFileId;
    
    // Mapping from file ID to array of addresses currently authorized
    mapping(uint256 => address[]) private fileViewers;

    // Events
    event FileUploaded(
        uint256 indexed id,
        string ipfsHash,
        string fileName,
        address indexed owner,
        uint256 timestamp
    );
    
    event FileShared(
        uint256 indexed id,
        address indexed owner,
        address indexed sharedWith
    );
    
    event AccessRevoked(
        uint256 indexed id,
        address indexed owner,
        address indexed revokedFrom
    );
    
    event FileVisibilityChanged(
        uint256 indexed id,
        address indexed owner,
        bool isPublic
    );
    
    event FileDeleted(
        uint256 indexed id,
        address indexed owner
    );

    // Modifiers
    modifier onlyOwner(uint256 _fileId) {
        require(files[_fileId].owner == msg.sender, "Web3Drive: Caller is not the file owner");
        require(!files[_fileId].isDeleted, "Web3Drive: File has been deleted");
        _;
    }

    modifier hasAccess(uint256 _fileId) {
        require(!files[_fileId].isDeleted, "Web3Drive: File has been deleted");
        require(
            files[_fileId].owner == msg.sender || 
            files[_fileId].isPublic || 
            fileAccess[_fileId][msg.sender],
            "Web3Drive: Access denied"
        );
        _;
    }

    /**
     * @notice Uploads a new file record to the blockchain.
     * @param _ipfsHash The CID of the encrypted file stored on IPFS.
     * @param _fileName The original name of the file.
     * @param _fileType The MIME type of the file.
     * @param _fileSize The size of the file in bytes.
     * @param _encryptedKey The encrypted AES symmetric key.
     * @param _fileHash The original unencrypted SHA-256 file hash.
     * @param _isPublic True if the file is shared publicly, false if private.
     */
    function uploadFile(
        string calldata _ipfsHash,
        string calldata _fileName,
        string calldata _fileType,
        uint256 _fileSize,
        string calldata _encryptedKey,
        string calldata _fileHash,
        bool _isPublic
    ) external returns (uint256) {
        require(bytes(_ipfsHash).length > 0, "Web3Drive: IPFS hash is required");
        require(bytes(_fileName).length > 0, "Web3Drive: File name is required");
        
        fileCount++;
        
        files[fileCount] = FileMetadata({
            id: fileCount,
            ipfsHash: _ipfsHash,
            fileName: _fileName,
            fileType: _fileType,
            fileSize: _fileSize,
            encryptedKey: _encryptedKey,
            fileHash: _fileHash,
            owner: msg.sender,
            timestamp: block.timestamp,
            isPublic: _isPublic,
            isDeleted: false
        });
        
        userFiles[msg.sender].push(fileCount);
        cidToFileId[_ipfsHash] = fileCount;
        
        emit FileUploaded(fileCount, _ipfsHash, _fileName, msg.sender, block.timestamp);
        
        return fileCount;
    }

    /**
     * @notice Shares a file with a specific wallet address.
     * @param _fileId The ID of the file to share.
     * @param _userToShare The wallet address to grant access.
     */
    function shareFile(uint256 _fileId, address _userToShare) external onlyOwner(_fileId) {
        require(_userToShare != address(0), "Web3Drive: Invalid share address");
        require(_userToShare != msg.sender, "Web3Drive: Cannot share with yourself");
        require(!fileAccess[_fileId][_userToShare], "Web3Drive: Already shared with this user");
        
        fileAccess[_fileId][_userToShare] = true;
        sharedFiles[_userToShare].push(_fileId);
        fileViewers[_fileId].push(_userToShare);
        
        emit FileShared(_fileId, msg.sender, _userToShare);
    }

    /**
     * @notice Revokes a user's access to a private file.
     * @param _fileId The ID of the file.
     * @param _userToRevoke The wallet address to revoke.
     */
    function revokeAccess(uint256 _fileId, address _userToRevoke) external onlyOwner(_fileId) {
        require(fileAccess[_fileId][_userToRevoke], "Web3Drive: Not shared with this user");
        
        fileAccess[_fileId][_userToRevoke] = false;
        
        // Remove from the shared files array of the revoked user
        uint256[] storage sFiles = sharedFiles[_userToRevoke];
        for (uint256 i = 0; i < sFiles.length; i++) {
            if (sFiles[i] == _fileId) {
                // Swap with the last element and pop to delete efficiently
                sFiles[i] = sFiles[sFiles.length - 1];
                sFiles.pop();
                break;
            }
        }
        
        // Remove from the fileViewers array using swap-and-pop method
        address[] storage viewers = fileViewers[_fileId];
        for (uint256 i = 0; i < viewers.length; i++) {
            if (viewers[i] == _userToRevoke) {
                viewers[i] = viewers[viewers.length - 1];
                viewers.pop();
                break;
            }
        }
        
        emit AccessRevoked(_fileId, msg.sender, _userToRevoke);
    }

    /**
     * @notice Revokes a user's access to a private file using its IPFS CID.
     * @param _cid The IPFS hash (CID) of the file.
     * @param _userToRevoke The wallet address to revoke.
     */
    function revokeAccess(string memory _cid, address _userToRevoke) external {
        uint256 fileId = cidToFileId[_cid];
        require(fileId != 0, "Web3Drive: File not found");
        require(files[fileId].owner == msg.sender, "Web3Drive: Caller is not the file owner");
        require(!files[fileId].isDeleted, "Web3Drive: File has been deleted");
        require(fileAccess[fileId][_userToRevoke], "Web3Drive: Not shared with this user");
        
        fileAccess[fileId][_userToRevoke] = false;
        
        // Remove from the shared files array of the revoked user
        uint256[] storage sFiles = sharedFiles[_userToRevoke];
        for (uint256 i = 0; i < sFiles.length; i++) {
            if (sFiles[i] == fileId) {
                sFiles[i] = sFiles[sFiles.length - 1];
                sFiles.pop();
                break;
            }
        }
        
        // Remove from the fileViewers array using swap-and-pop method
        address[] storage viewers = fileViewers[fileId];
        for (uint256 i = 0; i < viewers.length; i++) {
            if (viewers[i] == _userToRevoke) {
                viewers[i] = viewers[viewers.length - 1];
                viewers.pop();
                break;
            }
        }
        
        emit AccessRevoked(fileId, msg.sender, _userToRevoke);
    }

    /**
     * @notice Returns the list of addresses that have access to a file.
     * @param _fileId The ID of the file.
     */
    function getFileViewers(uint256 _fileId) external view onlyOwner(_fileId) returns (address[] memory) {
        return fileViewers[_fileId];
    }

    /**
     * @notice Toggles the visibility of a file between Public and Private.
     * @param _fileId The ID of the file.
     * @param _isPublic True to make public, false to make private.
     */
    function toggleVisibility(uint256 _fileId, bool _isPublic) external onlyOwner(_fileId) {
        files[_fileId].isPublic = _isPublic;
        emit FileVisibilityChanged(_fileId, msg.sender, _isPublic);
    }

    /**
     * @notice Marks a file record as deleted.
     * @param _fileId The ID of the file to delete.
     */
    function deleteFile(uint256 _fileId) external onlyOwner(_fileId) {
        files[_fileId].isDeleted = true;
        emit FileDeleted(_fileId, msg.sender);
    }

    /**
     * @notice Retrieves file metadata details.
     * @param _fileId The ID of the file.
     */
    function getFile(uint256 _fileId) external view hasAccess(_fileId) returns (FileMetadata memory) {
        return files[_fileId];
    }

    /**
     * @notice Verifies if a file matches its on-chain registration (integrity checker).
     * @param _fileId The file ID to verify.
     * @param _challengeHash The computed SHA-256 hash of the local file.
     * @return isValid True if hash matches, false otherwise.
     * @return owner The address of the file owner.
     * @return timestamp The timestamp when the file was registered.
     */
    function verifyFileIntegrity(uint256 _fileId, string calldata _challengeHash) 
        external 
        view 
        returns (bool isValid, address owner, uint256 timestamp) 
    {
        FileMetadata memory file = files[_fileId];
        if (file.isDeleted || bytes(file.fileHash).length == 0) {
            return (false, address(0), 0);
        }
        
        bool matches = keccak256(bytes(file.fileHash)) == keccak256(bytes(_challengeHash));
        return (matches, file.owner, file.timestamp);
    }

    /**
     * @notice Lists all active files owned by the caller.
     */
    function getMyFiles() external view returns (FileMetadata[] memory) {
        uint256[] memory myIds = userFiles[msg.sender];
        
        // Count active non-deleted files first to allocate correct array size
        uint256 activeCount = 0;
        for (uint256 i = 0; i < myIds.length; i++) {
            if (!files[myIds[i]].isDeleted) {
                activeCount++;
            }
        }
        
        FileMetadata[] memory myActiveFiles = new FileMetadata[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < myIds.length; i++) {
            if (!files[myIds[i]].isDeleted) {
                myActiveFiles[index] = files[myIds[i]];
                index++;
            }
        }
        
        return myActiveFiles;
    }

    /**
     * @notice Lists all active files shared with the caller.
     */
    function getSharedWithMe() external view returns (FileMetadata[] memory) {
        uint256[] memory sharedIds = sharedFiles[msg.sender];
        
        // Filter out any files that are deleted or whose access has been revoked
        uint256 activeCount = 0;
        for (uint256 i = 0; i < sharedIds.length; i++) {
            uint256 fid = sharedIds[i];
            if (!files[fid].isDeleted && fileAccess[fid][msg.sender]) {
                activeCount++;
            }
        }
        
        FileMetadata[] memory activeSharedFiles = new FileMetadata[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < sharedIds.length; i++) {
            uint256 fid = sharedIds[i];
            if (!files[fid].isDeleted && fileAccess[fid][msg.sender]) {
                activeSharedFiles[index] = files[fid];
                index++;
            }
        }
        
        return activeSharedFiles;
    }

    /**
     * @notice Returns whether a specific user has access to a file.
     * @param _fileId The ID of the file.
     * @param _user The address of the user.
     */
    function checkAccess(uint256 _fileId, address _user) external view returns (bool) {
        if (files[_fileId].isDeleted) {
            return false;
        }
        return (
            files[_fileId].owner == _user || 
            files[_fileId].isPublic || 
            fileAccess[_fileId][_user]
        );
    }
}
