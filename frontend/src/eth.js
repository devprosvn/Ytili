import { ethers } from 'ethers';
import tokenAbi from './abis/YtiliToken.json';
import donationRegistryAbi from './abis/DonationRegistry.json';

// Addresses of deployed contracts on Saga mainnet (already deployed)
export const YTILI_TOKEN_ADDRESS = '0xced157786AF1dA910F8B4dAbc1F8F96028249782';
export const DONATION_REGISTRY_ADDRESS = '0xB43d4E8D30c6198C0060Ad32d5Ce9Cf1d49fc334';

// When the user has MetaMask injected, we can construct a provider on demand.
export function getProvider() {
  if (!window.ethereum) throw new Error('MetaMask not found');
  return new ethers.providers.Web3Provider(window.ethereum);
}

export function getSigner() {
  return getProvider().getSigner();
}

export function getTokenContract() {
  return new ethers.Contract(YTILI_TOKEN_ADDRESS, tokenAbi, getSigner());
}

export const DonationType = {
  MEDICATION: 0,
  MEDICAL_SUPPLY: 1,
  FOOD: 2,
  CASH: 3
};

export function getDonationRegistryContract() {
  return new ethers.Contract(DONATION_REGISTRY_ADDRESS, donationRegistryAbi, getSigner());
}
