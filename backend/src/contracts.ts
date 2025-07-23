import { ethers } from 'ethers';
import dotenv from 'dotenv';

import YtiliTokenArtifact from '../../contracts/artifacts/contracts/YtiliToken.sol/YtiliToken.json';
import DonationRegistryArtifact from '../../contracts/artifacts/contracts/DonationRegistry.sol/DonationRegistry.json';
import TransparencyVerifierArtifact from '../../contracts/artifacts/contracts/TransparencyVerifier.sol/TransparencyVerifier.json';

dotenv.config();

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);

export const ytiliToken = new ethers.Contract(
  '0xced157786AF1dA910F8B4dAbc1F8F96028249782',
  YtiliTokenArtifact.abi,
  provider
);

export const donationRegistry = new ethers.Contract(
  '0xB43d4E8D30c6198C0060Ad32d5Ce9Cf1d49fc334',
  DonationRegistryArtifact.abi,
  provider
);

export const transparencyVerifier = new ethers.Contract(
  '0xBd6b063051F374D0D6838250CfBb0d817344ff35',
  TransparencyVerifierArtifact.abi,
  provider
);
