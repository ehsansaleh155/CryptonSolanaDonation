import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { CryptonSolanaDonation } from "../target/types/crypton_solana_donation";

import { expect } from 'chai';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);

describe("CryptonSolanaDonation", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CryptonSolanaDonation as Program<CryptonSolanaDonation>;

  const provider = anchor.getProvider();
  const donator1 = anchor.web3.Keypair.generate();
  const donator2 = anchor.web3.Keypair.generate();

  before(async () => {
    await provider.connection.requestAirdrop(donator1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(donator2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
  })

  async function find_donation_bank(owner: anchor.web3.PublicKey) {
    const [donationBank, _bump] = await anchor.web3.PublicKey.findProgramAddress(
      [owner.toBuffer()], program.programId);
    return donationBank
  }

  async function find_registry(owner: anchor.web3.PublicKey, donator: anchor.web3.PublicKey) {
    const [donationBank, _donationBankBump] = await anchor.web3.PublicKey.findProgramAddress(
      [owner.toBuffer()], program.programId);
    const [donation_data, _registryBump] = await anchor.web3.PublicKey.findProgramAddress(
      [donationBank.toBuffer(), donator.toBuffer()], program.programId
    );
    return donation_data;
  }

  it("Should initialize if payer and owner are the same", async () => {
    await program.methods.initialize(provider.wallet.publicKey)
      .accounts({
        payer: provider.wallet.publicKey,
      })
      .rpc();

    const [donationBank, _bump] = await anchor.web3.PublicKey.findProgramAddress(
      [provider.wallet.publicKey.toBuffer()], program.programId);

    const donationBankAccount = await program.account.donationBank.fetch(donationBank);
    expect(donationBankAccount.owner).to.be.deep.equal(provider.wallet.publicKey);
  });

  it("Should initialize if payer and owner are different", async () => {
    // The owner can be other program via CPI invocation
    const owner = anchor.web3.Keypair.generate();

    await program.methods.initialize(owner.publicKey)
      .accounts({
        payer: provider.wallet.publicKey,
      })
      .rpc();

    const [donationBank, _bump] = await anchor.web3.PublicKey.findProgramAddress(
      [owner.publicKey.toBuffer()], program.programId);

    const donationBankAccount = await program.account.donationBank.fetch(donationBank);
    expect(donationBankAccount.owner).to.be.deep.equal(owner.publicKey);
  });

  it("Should make a donation -> transfer lamports, create donation_data PDA, emit event", async () => {
    const donationBank = await find_donation_bank(provider.wallet.publicKey);
    const donationBankBalanceBefore = await provider.connection.getBalance(donationBank);

    const donation_data = await find_registry(provider.wallet.publicKey, donator1.publicKey);
    let registryAccount = await program.account.donation_data.fetchNullable(donation_data);
    expect(registryAccount).to.be.null;

    let listener = null;
    let [event, slot] = await new Promise((resolve, _reject) => {
      listener = program.addEventListener("DonationEvent", (event, slot) => {
        resolve([event, slot]);
      });
      program.methods.makeDonation(new anchor.BN(10000))
        .accounts({
          donationBank,
          donator: donator1.publicKey,
        })
        .signers([donator1])
        .rpc();
    });
    await program.removeEventListener(listener);

    expect(slot).to.gt(0);
    expect(event.donationBank).to.be.deep.equal(donationBank);
    expect(event.donator).to.be.deep.equal(donator1.publicKey);
    expect(event.amount.toNumber()).to.be.deep.equal(10000);

    registryAccount = await program.account.donation_data.fetch(donation_data);
    expect(registryAccount.donator).to.be.deep.equal(donator1.publicKey);
    expect(registryAccount.amount.toNumber()).to.be.equal(10000);

    const donationBankBalanceAfter = await provider.connection.getBalance(donationBank);
    expect(donationBankBalanceAfter - donationBankBalanceBefore).to.be.equal(10000);
  });

  it("Should make a donation multiple times -> transfer lamports, create donation_data PDA, emit event", async () => {
    const donationBank = await find_donation_bank(provider.wallet.publicKey);
    const donationBankBalanceBefore = await provider.connection.getBalance(donationBank);

    const donation_data = await find_registry(provider.wallet.publicKey, donator2.publicKey);
    let registryAccount = await program.account.donation_data.fetchNullable(donation_data);
    expect(registryAccount).to.be.null;

    // First donation
    await program.methods.makeDonation(new anchor.BN(10000))
      .accounts({
        donationBank,
        donator: donator2.publicKey,
      })
      .signers([donator2])
      .rpc();

    registryAccount = await program.account.donation_data.fetch(donation_data);
    expect(registryAccount.donator).to.be.deep.equal(donator2.publicKey);
    expect(registryAccount.amount.toNumber()).to.be.equal(10000);

    let donationBankBalanceAfter = await provider.connection.getBalance(donationBank);
    expect(donationBankBalanceAfter - donationBankBalanceBefore).to.be.equal(10000);

    // Second donation
    await program.methods.makeDonation(new anchor.BN(20000))
      .accounts({
        donationBank,
        donator: donator2.publicKey,
      })
      .signers([donator2])
      .rpc();

    registryAccount = await program.account.donation_data.fetch(donation_data);
    expect(registryAccount.donator).to.be.deep.equal(donator2.publicKey);
    expect(registryAccount.amount.toNumber()).to.be.equal(30000);
    expect(registryAccount.donationBank).to.be.deep.equal(donationBank);

    donationBankBalanceAfter = await provider.connection.getBalance(donationBank);
    expect(donationBankBalanceAfter - donationBankBalanceBefore).to.be.equal(30000);
  });

  it("Should NOT make a donation if amount is zero", async () => {
    const donationBank = await find_donation_bank(provider.wallet.publicKey);
    await expect(program.methods.makeDonation(new anchor.BN(0))
      .accounts({
        donationBank,
        donator: donator1.publicKey,
      })
      .signers([donator1])
      .rpc()).to.be.rejectedWith(/amount should be more than zero/);
  });

  it("Should NOT make a donation if insufficient lamports", async () => {
    const donator3 = anchor.web3.Keypair.generate();
    const donationBank = await find_donation_bank(provider.wallet.publicKey);
    await expect(program.methods.makeDonation(new anchor.BN(10000))
      .accounts({
        donationBank,
        donator: donator3.publicKey,
      })
      .signers([donator3])
      .rpc()).to.be.rejected;
  });

  it("Should calc sum of all donation to donation bank", async () => {
    const donationBank = await find_donation_bank(provider.wallet.publicKey);
    const all = await program.account.donation_data.all([
      {
        memcmp: {
          offset: 8, // Discriminator
          bytes: anchor.utils.bytes.bs58.encode(donationBank.toBuffer())
        }
      }
    ]);
    expect(all.length).to.be.equal(2);
    const sum = all.map(donation_data => donation_data.account.amount).reduce((acc, cur) => acc.add(cur));
    expect(sum.toNumber()).to.be.equal(40000);
  });

  it("Should withdraw -> transfer lamports, leave rent exempt, emit event", async () => {
    const destination = anchor.web3.Keypair.generate();
    const rentExemptionDest = await provider.connection.getMinimumBalanceForRentExemption(0);
    const rentExemptionBank = await provider.connection.getMinimumBalanceForRentExemption(32 + 8);

    const donationBank = await find_donation_bank(provider.wallet.publicKey);
    const bankBefore = await provider.connection.getBalance(donationBank);

    let listener = null;
    let [event, slot] = await new Promise((resolve, _reject) => {
      listener = program.addEventListener("WithdrawEvent", (event, slot) => {
        resolve([event, slot]);
      });
      program.methods.withdraw()
        .accounts({
          donationBank: donationBank,
          owner: provider.wallet.publicKey,
          destination: destination.publicKey,
        })
        .preInstructions([anchor.web3.SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: destination.publicKey,
          lamports: rentExemptionDest,
        })])
        .rpc();
    });
    await program.removeEventListener(listener);

    const bankAfter = await provider.connection.getBalance(donationBank);
    const destAfter = await provider.connection.getBalance(destination.publicKey);

    expect(bankAfter).to.be.equal(rentExemptionBank);
    expect(destAfter).to.be.equal(bankBefore - bankAfter + rentExemptionDest);

    expect(slot).to.gt(0);
    expect(event.donationBank).to.be.deep.equal(donationBank);
    expect(event.destination).to.be.deep.equal(destination.publicKey);
    expect(event.amount.toNumber()).to.be.deep.equal(bankBefore - bankAfter);
  });

  it("Shoud NOT withdraw if bank is empty", async () => {
    const donationBank = await find_donation_bank(provider.wallet.publicKey);
    const rentExemptionBank = await provider.connection.getMinimumBalanceForRentExemption(32 + 8);
    const donationBankBalance = await provider.connection.getBalance(donationBank);

    expect(donationBankBalance).to.be.equal(rentExemptionBank);

    await expect(program.methods.withdraw()
      .accounts({
        donationBank,
        owner: provider.wallet.publicKey,
        destination: provider.wallet.publicKey,
      })
      .rpc()).to.be.rejectedWith(/The donation bank is empty/);
  });

  it("Should NOT withdraw with invalid owner", async () => {
    const donationBank = await find_donation_bank(provider.wallet.publicKey);
    const owner = anchor.web3.Keypair.generate();

    await expect(program.methods.withdraw()
      .accounts({
        donationBank,
        owner: owner.publicKey,
        destination: provider.wallet.publicKey,
      })
      .rpc()).to.be.rejected;
  });

  it("Should NOT withdraw with empty destination", async () => {
    const donationBank = await find_donation_bank(provider.wallet.publicKey);
    const destination = anchor.web3.Keypair.generate();

    await expect(program.methods.withdraw()
      .accounts({
        donationBank,
        owner: provider.wallet.publicKey,
        destination: destination.publicKey,
      })
      .rpc()).to.be.rejected;
  });
});
