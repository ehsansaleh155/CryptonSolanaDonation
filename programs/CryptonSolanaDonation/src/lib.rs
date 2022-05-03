use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;

declare_id!("42bUpNbzyBA4wPz3eFTRkhXq7odYdt9wv8jKeucS869p");

#[program]
pub mod crypton_solana_donation {
    use super::*;

/*=====================================================================================*/
    pub fn initialize(ctx: Context<Initialize>, owner: Pubkey) -> Result<()> {
        let base_account = &mut ctx.accounts.base_account;
        base_account.owner = owner;
        Ok(())
    }
/*=====================================================================================*/
    pub fn do_donation(ctx: Context<DoDonation>, amount: u64) -> Result<()> {
        
        require!(amount > 0, DonationError::InvalidAmount);
        //=======================================================================
        
        invoke(
            &system_instruction::transfer(
                &ctx.accounts.donator.key(),
                &ctx.accounts.donation_bank.key(),
                amount,
            ),
            &[
                ctx.accounts.donator.to_account_info(),
                ctx.accounts.donation_bank.to_account_info(),
            ],
        )
        .map_err(Into::<error::Error>::into)?;
        //=======================================================================
        let donation_data = &mut ctx.accounts.donation_data;
        if donation_data.amount == 0 {
            donation_data.donator = ctx.accounts.donator.key();
            donation_data.donation_bank = ctx.accounts.donation_bank.key();
        }
        donation_data.amount = donation_data.amount.saturating_add(amount);
        //=======================================================================
        emit!(DonationEvent {
            donation_bank: ctx.accounts.donation_bank.key(),
            donator: ctx.accounts.donator.key(),
            amount,
        });

        Ok(())
    }
/*=====================================================================================*/
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {

        let rent_exempt_amount = rent::Rent::get()?.minimum_balance(BaseAccount::LEN);
        let bank = ctx.accounts.donation_bank.to_account_info();
        let amount = bank.try_lamports()?.saturating_sub(rent_exempt_amount);

        require!(amount > 0, DonationError::NoFundsForWithdrawal);

        let destination = ctx.accounts.destination.to_account_info();
        
        **destination.try_borrow_mut_lamports()? += amount;
        **bank.try_borrow_mut_lamports()? = amount;
        //=======================================================================
        emit!(WithdrawEvent {
            donation_bank: ctx.accounts.donation_bank.key(),
            destination: ctx.accounts.destination.key(),
            amount,
        });
        Ok(())
    }
/*=====================================================================================*/
}

/*
* 32 --> the size of the key,
* 8 ---> 8-byte-discriminator.
*/

#[derive(Accounts)]
#[instruction(owner: Pubkey, bump: u8)]
pub struct Initialize<'info> {
	#[account(init, payer = payer, space = 32 + 8, seeds = [owner.as_ref()], bump)]
	pub base_account: Account<'info, BaseAccount>,
	#[account(mut)]
	pub payer: Signer<'info>,
	pub system_program: Program<'info, System>,
}
/*=====================================================================================*/

#[derive(Accounts)]
pub struct DoDonation<'info> {
	#[account(mut)]
	pub donation_bank: Account<'info, BaseAccount>,
	#[account(init_if_needed, payer = donator, space = 64 + 1024, seeds = [donator.key().as_ref()], bump)]
	pub donation_data: Account<'info, DonationData>,
	#[account(mut)]
	pub donator: Signer<'info>,
	pub system_program: Program<'info, System>,
}
//==================================================

#[account]
pub struct BaseAccount {
	pub owner: Pubkey,
}

impl BaseAccount {
    const LEN: usize = 32 + 8;
}
//===================================================
#[account]
pub struct DonationData {
	pub donation_bank: Pubkey,
	pub donator: Pubkey,
	pub amount: u64,

}
/*=====================================================================================*/
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub donation_bank: Account<'info, BaseAccount>,
    pub owner: Signer<'info>,
    #[account(mut)]
    pub destination: Account<'info, BaseAccount>,
    #[account(mut)]
    pub bank: Account<'info, DonationData>,
}
/*=====================================================================================*/
#[error_code]
pub enum DonationError {
	#[msg("Amount should be more than zero!")]
	InvalidAmount,
	#[msg("The donation bank is empty")]
    NoFundsForWithdrawal,
}
/*=====================================================================================*/
#[event]
pub struct DonationEvent {
	pub donation_bank: Pubkey,
	pub donator: Pubkey,
	pub amount: u64,
}

#[event]
pub struct WithdrawEvent {
    pub donation_bank: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
}
/*=====================================================================================*/
