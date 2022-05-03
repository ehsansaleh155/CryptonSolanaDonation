import logo from './logo.svg';
import './App.css';
import { useState } from 'react';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, Provider, web3, BN } from '@project-serum/anchor';
import { Buffer } from 'buffer';
import idl from './idl.json';
import * as anchor from "@project-serum/anchor";

window.Buffer = Buffer; // for "Buffer is not defined"

const { SystemProgram, Keypair } = web3;
/* create an account  */
const crudAccount = Keypair.generate();
const opts = {
  preflightCommitment: "processed"
}
const programID = new PublicKey(idl.metadata.address);
const donationBank = new PublicKey("9aS35u3xPKTXEQeduTKQrbRGbpmJMzXxaH1C39xaTDrn");
const network = clusterApiUrl('devnet');

function App() {
  const [donationSize, setDonationSize] = useState("10000");
  const [donator, setDonatorValue] = useState();
  const [donationBankBalance, setDonationBankBalance] = useState(0);

  async function connectWallet() {
    try {
      const resp = await window.solana.connect();
      console.log("Connected! Public Key: ", resp.publicKey.toString());
    } catch (err) {
      console.log(err);
      // => { code: 4001, message: 'User rejected the request.' }
    }
  }

  async function disconnectWallet() {
    window.solana.disconnect();
    window.solana.on('disconnect', () => console.log("Disconnected!"));
  }

  async function updateBalance() {
    const provider = await getProvider();
    const program = new Program(idl, programID, provider);

    const balance = await provider.connection.getBalance(donationBank);
    const rent = await provider.connection.getMinimumBalanceForRentExemption(program.account.donationBank.size);
    console.log("Balance: ", balance, " Rent: ", rent, " Delta: ", balance - rent);
    setDonationBankBalance(balance - rent);
  }

  async function getProvider() {
    const connection = new Connection(network, opts.preflightCommitment);
    const wallet = window.solana;

    const provider = new Provider(
      connection, wallet, opts.preflightCommitment,
    );
    return provider;
  }

  async function makeDonation() {
    if (!donationSize) return;

    const provider = await getProvider();
    const program = new Program(idl, programID, provider);

    program.methods.makeDonation(new BN(donationSize))
      .accounts({
        donationBank,
        donator: provider.wallet.publicKey,
      })
      .rpc();
  }

  async function withdraw() {
    const provider = await getProvider();
    const program = new Program(idl, programID, provider);

    await program.methods.withdraw()
      .accounts({
        donationBank,
        authority: provider.wallet.publicKey,
        destination: provider.wallet.publicKey,
      })
      .rpc();
  }

  async function listDonators() {
    const provider = await getProvider();
    const program = new Program(idl, programID, provider);

    const all = await program.account.registry.all([
      {
        memcmp: {
          offset: 8, // Discriminator
          bytes: anchor.utils.bytes.bs58.encode(donationBank.toBuffer())
        }
      }
    ]);

    all.map(registry => registry.account.donator).forEach(donator => console.log("Donator: ", donator.toString()));
  }

  async function getDonationsForDonator() {
    if (!donator) return;

    const provider = await getProvider();
    const program = new Program(idl, programID, provider);
    const donatorKey = new PublicKey(donator);

    const [registry, _registryBump] = await web3.PublicKey.findProgramAddress(
      [donationBank.toBuffer(), donatorKey.toBuffer()], program.programId
    );

    let registryAccount = await program.account.registry.fetchNullable(registry);
    if (registryAccount) {
      console.log("Donator ", donatorKey.toString(), " has made donations for ", registryAccount.amount.toNumber() / web3.LAMPORTS_PER_SOL, " SOL");
    } else {
      console.log("Donator ", donatorKey.toString(), " has never made any donations!");
    }
  }

  return (
    <div className="App">
      <header className="App-header">
        <button onClick={connectWallet}>1. Connect to Wallet</button>
        <h1>{donationBankBalance / web3.LAMPORTS_PER_SOL} SOL </h1>
        <button onClick={updateBalance}>2. Read Balance </button>
        <button onClick={makeDonation}>3. Make a Donation</button>
        <input onChange={e => setDonationSize(e.target.value)} placeholder="Lamports" />

        <button onClick={withdraw}>4. Withdraw</button>
        <button onClick={listDonators}>5. List Donators </button>
        <button onClick={getDonationsForDonator}>6. Get Donations for Donator</button>
        <input onChange={e => setDonatorValue(e.target.value)} placeholder="Donator" />
        <button onClick={disconnectWallet}>7. Disconnect</button>
      </header>
    </div>
  );
}

export default App;
