// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title  PatientRecordContract
 * @author PRChain Solutions Ltd.
 * @notice Manages patient records on-chain for HealthCare Innovations Ltd.
 *         Supports adding records and transferring them between
 *         authorized healthcare providers.
 */
contract PatientRecordContract {

    // ─────────────────────────────────────────────────────────────
    //  STATE VARIABLES
    // ─────────────────────────────────────────────────────────────

    /// @notice Total number of patient records ever added (never decremented).
    uint256 public totalRecords;

    /// @notice Address of the contract deployer (hospital admin).
    address public admin;

    // ─────────────────────────────────────────────────────────────
    //  DATA STRUCTURES
    // ─────────────────────────────────────────────────────────────

    /// @dev Represents a single patient record stored on-chain.
    struct PatientRecord {
        uint256 recordId;          // Unique auto-incremented ID
        string  patientName;       // Full name of the patient
        uint256 dateOfBirth;       // Unix timestamp (e.g. 631152000 = 1990-01-01)
        string  diagnosis;         // Medical diagnosis description
        string  prescription;      // Current prescription details
        address currentProvider;   // Provider currently holding the record
        address originalProvider;  // Provider who first registered the record
        uint256 createdAt;         // Block timestamp when record was created
        uint256 updatedAt;         // Block timestamp of last update
        bool    isActive;          // Soft-delete flag
    }

    // ─────────────────────────────────────────────────────────────
    //  MAPPINGS
    // ─────────────────────────────────────────────────────────────

    /// @dev recordId => PatientRecord
    mapping(uint256 => PatientRecord) private records;

    /// @dev address => true if the provider is authorized
    mapping(address => bool) public authorizedProviders;

    /// @dev patientName (lowercase) => list of recordIds (for lookup)
    mapping(string => uint256[]) private patientRecordIds;

    // ─────────────────────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────────────────────

    /// @notice Emitted whenever a new patient record is added.
    event RecordAdded(
        uint256 indexed recordId,
        string  patientName,
        address indexed provider,
        uint256 timestamp
    );

    /// @notice Emitted whenever a record is transferred between providers.
    event RecordTransferred(
        uint256 indexed recordId,
        address indexed fromProvider,
        address indexed toProvider,
        uint256 timestamp
    );

    /// @notice Emitted when a provider is authorized or deauthorized.
    event ProviderAuthorizationChanged(
        address indexed provider,
        bool    authorized
    );

    // ─────────────────────────────────────────────────────────────
    //  MODIFIERS
    // ─────────────────────────────────────────────────────────────

    /// @dev Restricts function to the admin only.
    modifier onlyAdmin() {
        require(msg.sender == admin, "PatientRecordContract: caller is not admin");
        _;
    }

    /// @dev Restricts function to authorized healthcare providers.
    modifier onlyAuthorized() {
        require(
            authorizedProviders[msg.sender],
            "PatientRecordContract: caller is not an authorized provider"
        );
        _;
    }

    /// @dev Ensures the record exists and is active.
    modifier recordExists(uint256 _recordId) {
        require(_recordId > 0 && _recordId <= totalRecords, "PatientRecordContract: record does not exist");
        require(records[_recordId].isActive,                 "PatientRecordContract: record is inactive");
        _;
    }

    // ─────────────────────────────────────────────────────────────
    //  CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Deploys the contract.
     *         The deployer becomes the admin and is also
     *         automatically added as an authorized provider.
     */
    constructor() {
        admin = msg.sender;
        authorizedProviders[msg.sender] = true;
        emit ProviderAuthorizationChanged(msg.sender, true);
    }

    // ─────────────────────────────────────────────────────────────
    //  ADMIN FUNCTIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Authorize or revoke a healthcare provider.
     * @param _provider  Ethereum address of the provider.
     * @param _status    true = authorize, false = revoke.
     */
    function setProviderAuthorization(address _provider, bool _status)
        external
        onlyAdmin
    {
        require(_provider != address(0), "PatientRecordContract: zero address");
        authorizedProviders[_provider] = _status;
        emit ProviderAuthorizationChanged(_provider, _status);
    }

    // ─────────────────────────────────────────────────────────────
    //  CORE FUNCTIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Add a new patient record to the blockchain.
     * @dev    Only authorized providers may call this.
     *         Increments totalRecords and stores a PatientRecord struct.
     *
     * @param _patientName   Full name of the patient.
     * @param _dateOfBirth   Patient's date of birth as a Unix timestamp.
     * @param _diagnosis     Initial diagnosis string.
     * @param _prescription  Current prescription details.
     * @return recordId      The ID assigned to the newly created record.
     */
    function addPatientRecord(
        string  memory _patientName,
        uint256        _dateOfBirth,
        string  memory _diagnosis,
        string  memory _prescription
    )
        external
        onlyAuthorized
        returns (uint256 recordId)
    {
        require(bytes(_patientName).length > 0,  "PatientRecordContract: name cannot be empty");
        require(_dateOfBirth > 0,                "PatientRecordContract: invalid date of birth");

        // Auto-increment
        totalRecords++;
        recordId = totalRecords;

        records[recordId] = PatientRecord({
            recordId:         recordId,
            patientName:      _patientName,
            dateOfBirth:      _dateOfBirth,
            diagnosis:        _diagnosis,
            prescription:     _prescription,
            currentProvider:  msg.sender,
            originalProvider: msg.sender,
            createdAt:        block.timestamp,
            updatedAt:        block.timestamp,
            isActive:         true
        });

        // Index by patient name for lookup
        patientRecordIds[_toLower(_patientName)].push(recordId);

        emit RecordAdded(recordId, _patientName, msg.sender, block.timestamp);
    }

    /**
     * @notice Transfer a patient record to another authorized provider.
     * @dev    Only the provider currently holding the record may transfer it.
     *         The receiving provider must also be authorized.
     *
     * @param _recordId    ID of the record to transfer.
     * @param _toProvider  Address of the receiving healthcare provider.
     */
    function transferRecord(uint256 _recordId, address _toProvider)
        external
        onlyAuthorized
        recordExists(_recordId)
    {
        PatientRecord storage rec = records[_recordId];

        require(
            rec.currentProvider == msg.sender,
            "PatientRecordContract: only the current record holder can transfer"
        );
        require(
            _toProvider != address(0),
            "PatientRecordContract: cannot transfer to zero address"
        );
        require(
            authorizedProviders[_toProvider],
            "PatientRecordContract: recipient is not an authorized provider"
        );
        require(
            _toProvider != msg.sender,
            "PatientRecordContract: cannot transfer to yourself"
        );

        address previousProvider = rec.currentProvider;
        rec.currentProvider = _toProvider;
        rec.updatedAt = block.timestamp;

        emit RecordTransferred(_recordId, previousProvider, _toProvider, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────
    //  VIEW / QUERY FUNCTIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Retrieve a patient record by its ID.
     * @dev    Only authorized providers may read records.
     */
    function getRecord(uint256 _recordId)
        external
        view
        onlyAuthorized
        recordExists(_recordId)
        returns (PatientRecord memory)
    {
        return records[_recordId];
    }

    /**
     * @notice Get all record IDs associated with a patient name.
     * @dev    Case-insensitive lookup.
     */
    function getRecordIdsByPatient(string memory _patientName)
        external
        view
        onlyAuthorized
        returns (uint256[] memory)
    {
        return patientRecordIds[_toLower(_patientName)];
    }

    /**
     * @notice Check whether a given address is an authorized provider.
     */
    function isAuthorizedProvider(address _provider)
        external
        view
        returns (bool)
    {
        return authorizedProviders[_provider];
    }

    // ─────────────────────────────────────────────────────────────
    //  INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev Convert a string to lowercase for case-insensitive indexing.
     *      Handles ASCII letters only (sufficient for names in this context).
     */
    function _toLower(string memory _str) internal pure returns (string memory) {
        bytes memory bStr = bytes(_str);
        bytes memory bLower = new bytes(bStr.length);
        for (uint256 i = 0; i < bStr.length; i++) {
            bLower[i] = (bStr[i] >= 0x41 && bStr[i] <= 0x5A)
                ? bytes1(uint8(bStr[i]) + 32)
                : bStr[i];
        }
        return string(bLower);
    }
}
