const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting Web3Drive contract deployment...");

  // Get the ContractFactory
  const Web3Drive = await hre.ethers.getContractFactory("Web3Drive");
  
  // Deploy the contract
  const web3Drive = await Web3Drive.deploy();

  // Wait for the deployment to finish
  await web3Drive.waitForDeployment();

  const contractAddress = await web3Drive.getAddress();
  console.log(`Web3Drive deployed successfully to address: ${contractAddress}`);

  // Create a deployments folder if not exists
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  // Save details locally
  const networkName = hre.network.name;
  const deploymentData = {
    address: contractAddress,
    network: networkName,
    deployer: (await hre.ethers.getSigners())[0].address,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(deploymentsDir, `${networkName}.json`),
    JSON.stringify(deploymentData, null, 2)
  );
  console.log(`Deployment details saved to deployments/${networkName}.json`);

  // Sync ABI and address to Frontend and Backend directories
  const contractArtifactPath = path.join(
    __dirname,
    "../artifacts/contracts/Web3Drive.sol/Web3Drive.json"
  );

  if (fs.existsSync(contractArtifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(contractArtifactPath, "utf8"));
    const clientContractConfig = {
      address: contractAddress,
      abi: artifact.abi
    };

    // Ensure frontend target directories exist
    const frontendUtilsDir = path.join(__dirname, "../../frontend/src/utils");
    if (!fs.existsSync(frontendUtilsDir)) {
      fs.mkdirSync(frontendUtilsDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(frontendUtilsDir, "Web3Drive.json"),
      JSON.stringify(clientContractConfig, null, 2)
    );
    console.log("ABI and Address synced to Frontend: src/utils/Web3Drive.json");

    // Ensure backend target directories exist
    const backendConfigDir = path.join(__dirname, "../../backend/src/config");
    if (!fs.existsSync(backendConfigDir)) {
      fs.mkdirSync(backendConfigDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(backendConfigDir, "Web3Drive.json"),
      JSON.stringify(clientContractConfig, null, 2)
    );
    console.log("ABI and Address synced to Backend: src/config/Web3Drive.json");
  } else {
    console.log("Artifact file not found. Run compile before syncing.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
