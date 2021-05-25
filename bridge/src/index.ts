import { config } from "dotenv";

import Web3 from "web3";
import { init } from "@sentry/node";

import { BurnEventResult } from "./interfaces/burn-event-result";
import { IWrappedNCGMinter } from "./interfaces/wrapped-ncg-minter";
import { INCGTransfer } from "./interfaces/ncg-transfer";
import { EthereumBurnEventMonitor } from "./ethereum-burn-event-monitor";
import { NCGTransfer } from "./ncg-transfer";
import { WrappedNCGMinter } from "./wrapped-ncg-minter";
import { wNCGToken } from "./wrapped-ncg-token";
import HDWalletProvider from "@truffle/hdwallet-provider";
import { HeadlessGraphQLClient } from "./headless-graphql-client";
import { NineChroniclesTransferredEventMonitor } from "./nine-chronicles-transferred-event-monitor";
import { BlockHash } from "./types/block-hash";
import { TxId } from "./types/txid";
import { IHeadlessHTTPClient } from "./interfaces/headless-http-client";
import { HeadlessHTTPClient } from "./headless-http-client";

config();

const WEB_SOCKET_PROVIDER_URI: string | undefined = process.env.WEB_SOCKET_PROVIDER_URI;
if (WEB_SOCKET_PROVIDER_URI === undefined) {
    console.error("Please set 'WEB_SOCKET_PROVIDER_URI' at .env");
    process.exit(-1);
}

const GRAPHQL_API_ENDPOINT: string | undefined = process.env.GRAPHQL_API_ENDPOINT;
if (GRAPHQL_API_ENDPOINT === undefined) {
    console.error("Please set 'GRAPHQL_API_ENDPOINT' at .env");
    process.exit(-1);
}

const HTTP_ROOT_API_ENDPOINT: string | undefined = process.env.HTTP_ROOT_API_ENDPOINT;
if (HTTP_ROOT_API_ENDPOINT === undefined) {
    console.error("Please set 'HTTP_ROOT_API_ENDPOINT' at .env");
    process.exit(-1);
}

const BRIDGE_9C_ADDRESS: string | undefined = process.env.BRIDGE_9C_ADDRESS;
if (BRIDGE_9C_ADDRESS === undefined) {
    console.error("Please set 'BRIDGE_9C_ADDRESS' at .env");
    process.exit(-1);
}

const BRIDGE_9C_PRIVATE_KEY: string | undefined = process.env.BRIDGE_9C_PRIVATE_KEY;
if (BRIDGE_9C_PRIVATE_KEY === undefined) {
    console.error("Please set 'BRIDGE_9C_PRIVATE_KEY' at .env");
    process.exit(-1);
}

const CHAIN_ID_STRING: string | undefined = process.env.CHAIN_ID;
if (CHAIN_ID_STRING === undefined) {
    console.error("Please set 'CHAIN_ID' at .env");
    process.exit(-1);
}

const CHAIN_ID = parseInt(CHAIN_ID_STRING);
if (CHAIN_ID === NaN) {
    console.error("Please set 'CHAIN_ID' with valid format at .env");
    process.exit(-1);
}

const HD_WALLET_PROVIDER_URL: string | undefined = process.env.HD_WALLET_PROVIDER_URL;
if (HD_WALLET_PROVIDER_URL === undefined) {
    console.error("Please set 'HD_WALLET_PROVIDER_URL' at .env");
    process.exit(-1);
}

const HD_WALLET_MNEMONIC: string | undefined = process.env.HD_WALLET_MNEMONIC;
if (HD_WALLET_MNEMONIC === undefined) {
    console.error("Please set 'HD_WALLET_MNEMONIC' at .env");
    process.exit(-1);
}

const HD_WALLET_MNEMONIC_ADDRESS_NUMBER_STRING: string | undefined = process.env.HD_WALLET_MNEMONIC_ADDRESS_NUMBER;
if (HD_WALLET_MNEMONIC_ADDRESS_NUMBER_STRING === undefined) {
    console.error("Please set 'HD_WALLET_MNEMONIC_ADDRESS_NUMBER' at .env");
    process.exit(-1);
}

const HD_WALLET_MNEMONIC_ADDRESS_NUMBER = parseInt(HD_WALLET_MNEMONIC_ADDRESS_NUMBER_STRING);
if (HD_WALLET_MNEMONIC_ADDRESS_NUMBER === NaN) {
    console.error("Please set 'HD_WALLET_MNEMONIC_ADDRESS_NUMBER' with valid format at .env");
    process.exit(-1);
}

const DEBUG: string | undefined = process.env.DEBUG;
if (DEBUG !== undefined && DEBUG !== 'TRUE') {
    console.error("Please set 'DEBUG' as 'TRUE' or remove 'DEBUG' at .env.");
    process.exit(-1);
}

const SENTRY_DSN: string | undefined = process.env.SENTRY_DSN;
if (SENTRY_DSN !== undefined) {
    init({
        dsn: SENTRY_DSN,
    });
}

(async () => {
    const CONFIRMATIONS = 10;

    const headlessGraphQLCLient = new HeadlessGraphQLClient(GRAPHQL_API_ENDPOINT);
    const ncgTransfer: INCGTransfer = new NCGTransfer(headlessGraphQLCLient, BRIDGE_9C_ADDRESS);
    const hdWalletProvider = new HDWalletProvider({
        mnemonic: HD_WALLET_MNEMONIC,
        addressIndex: HD_WALLET_MNEMONIC_ADDRESS_NUMBER,
        providerOrUrl: HD_WALLET_PROVIDER_URL,
        numberOfAddresses: HD_WALLET_MNEMONIC_ADDRESS_NUMBER + 1,
        chainId: CHAIN_ID,
    });
    const web3 = new Web3(hdWalletProvider);

    const monitor = new EthereumBurnEventMonitor(web3, wNCGToken, await web3.eth.getBlockNumber(), CONFIRMATIONS);
    const unsubscribe = monitor.subscribe(async eventLog => {
        const burnEventResult = eventLog.returnValues as BurnEventResult;
        const txId = await ncgTransfer.transfer(burnEventResult._sender, BigInt(burnEventResult.amount));
        console.log("Transferred", txId);
    });

    const headlessHttpClient: IHeadlessHTTPClient = new HeadlessHTTPClient(HTTP_ROOT_API_ENDPOINT);
    await headlessHttpClient.setPrivateKey(BRIDGE_9C_PRIVATE_KEY);

    const minter: IWrappedNCGMinter = new WrappedNCGMinter(web3, wNCGToken, hdWalletProvider.getAddress());
    const latestBlockNumber = await headlessGraphQLCLient.getTipIndex();  // TODO: load from persistent storage.
    let latestMintedBlockHash: BlockHash, latestMintedTxId: TxId;
    const nineChroniclesMonitor = new NineChroniclesTransferredEventMonitor(latestBlockNumber, 50, headlessGraphQLCLient, BRIDGE_9C_ADDRESS);
    // chain id, 1, means mainnet. See EIP-155, https://github.com/ethereum/EIPs/blob/master/EIPS/eip-155.md#specification.
    // It should be not able to run in mainnet because it is for test.
    if (DEBUG === 'TRUE' && CHAIN_ID !== 1) {
        nineChroniclesMonitor.subscribe(async event => {
            console.log("Receipt", await minter.mint(event.sender, parseFloat(event.amount)));
            latestMintedBlockHash = event.blockHash;
            latestMintedTxId = event.txId;
        });
    }

    monitor.run();
    nineChroniclesMonitor.run();
})();