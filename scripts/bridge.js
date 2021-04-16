var Web3 = require('web3');
const { networks } = require('./config.js');

const network = networks[process.env['NETWORK']];
const poa = network.poa || false;
const w3 = new Web3(network.rpc);
const bombDelayFromParent = network.bombDelayFromParent || 900000000;
const bridgeAddress = network.bridge.address || process.env['BRIDGE'];

console.log("Deploying bridge to " + process.env['NETWORK']);
console.log("Using bridge at address", bridgeAddress);

let sleep = require('util').promisify(setTimeout);
var rlp = require('rlp');
const lib = require('./lib');

const MAX_BLOCK_CHUNK = 10;

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Running from the address:",
    deployer.address
  );
  console.log("Account balance:", (await deployer.getBalance()).toString());

  var Bridge;
  if (bridgeAddress == null) {
    const genesis_block = await w3.eth.getBlock("latest");

    if (poa) {
      const BridgeFactory = await ethers.getContractFactory("BridgeBinance");
      const validators = await lib.getValidatorsBinance(w3, genesis_block.number);
      Bridge = await BridgeFactory.deploy(lib.getBlockRlp(genesis_block), validators);
    } else {
      const BridgeFactory = await ethers.getContractFactory("Bridge");
      Bridge = await BridgeFactory.deploy(lib.getBlockRlp(genesis_block), bombDelayFromParent);
    }
    network.bridge.address = Bridge.address;
    console.log("Deployed Bridge address:", Bridge.address);
  } else {
    Bridge = await ethers.getContractAt("Bridge", bridgeAddress);
  }

  var seen = {};
  while (1) {
    const longestCommitedChainHash = await Bridge.getLongestChainEndpoint();
    console.log("longestCommitedChainHash:", longestCommitedChainHash);
    if (seen[longestCommitedChainHash]) {
      await sleep(5000);
      continue;
    }

    var hdr = await Bridge.getHeader(longestCommitedChainHash);
    var blockNumber = hdr['blockNumber'].toNumber();

    const latestBlock = await w3.eth.getBlock('latest');
    const blocksBehind = latestBlock['number'] - blockNumber;
    console.log("we are at", blockNumber, "which is", blocksBehind, "blocks behind", latestBlock['number']);

    // not behind?
    if (blocksBehind == 0) {
      await sleep(5000);
      continue;
    }

    // new headers to submit
    var hdrs = [];

    // might rewind a bit for chain reorg
    while (1) {
      const supposedCurrentBlock = await w3.eth.getBlock(blockNumber);
      if (await Bridge.isHeaderStored(supposedCurrentBlock['hash'])) break;
      blockNumber -= 1;
      console.log("rewinding...");
    }

    console.log("syncing from block", blockNumber);
    while (hdrs.length < MAX_BLOCK_CHUNK && blockNumber != latestBlock['number']) {
      blockNumber += 1;
      const new_block = await w3.eth.getBlock(blockNumber);
      hdrs.push(lib.getBlockRlp(new_block));
    }

    const ret = await Bridge.submitHeaders(hdrs);
    console.log("submitted", hdrs.length, "block headers with tx hash", ret['hash']);

    // we can wait for the transaction now
    seen[longestCommitedChainHash] = true;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

