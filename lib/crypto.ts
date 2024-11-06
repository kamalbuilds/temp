import * as secp from '@noble/secp256k1';
import { ethers } from 'ethers';
import * as sha3 from 'js-sha3';
import { KEY_REGISTRY_ABI } from '@/abi/KeyRegistry';
import { REGISTRY_CONTRACT_ADDRESS } from '@/lib/constants';
import type { StealthKeys } from './types';

export async function registerKeys(keys: StealthKeys) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(REGISTRY_CONTRACT_ADDRESS, KEY_REGISTRY_ABI, signer);

  const parsePublicKey = (publicKey: string) => {
    const hexString = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;
    const prefix = parseInt(hexString.slice(0, 2), 16);
    const key = BigInt(`0x${hexString.slice(2)}`);
    return { prefix, key };
  };

  const { prefix: spendingPubKeyPrefix, key: spendingPubKey } = parsePublicKey(keys.spendingPublicKey);
  const { prefix: viewingPubKeyPrefix, key: viewingPubKey } = parsePublicKey(keys.viewingPublicKey);

  const tx = await contract.setStealthMetaAddress(
    spendingPubKeyPrefix,
    spendingPubKey,
    viewingPubKeyPrefix,
    viewingPubKey
  );

  await tx.wait();
}

export async function getStealthKeys(address: string): Promise<StealthKeys> {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const contract = new ethers.Contract(REGISTRY_CONTRACT_ADDRESS, KEY_REGISTRY_ABI, provider);

  try {
    const [spendingPubKeyPrefix, spendingPubKey, viewingPubKeyPrefix, viewingPubKey] = await contract.getStealthMetaAddress(address);
    console.log(spendingPubKeyPrefix, spendingPubKey, viewingPubKeyPrefix, viewingPubKey,"getStealthKeys");
    const spendingPublicKey = `0x${spendingPubKeyPrefix.toString(16)}${spendingPubKey.toString(16)}`;
    const viewingPublicKey = `0x${viewingPubKeyPrefix.toString(16)}${viewingPubKey.toString(16)}`;

    return {
      spendingPublicKey,
      viewingPublicKey
    };
  } catch (error) {
    if (error.message.includes('BAD_DATA')) {
      return {
        spendingPublicKey: '',
        viewingPublicKey: ''
      };
    }
    throw error;
  }
}

// function that generates a pair of stealth keys from a signature. The function creates viewing and spending key pairs using the signature as entropy.

export function calculateStealthPrivateKey(
  ephemeralPublicKey: string,
  viewingPrivateKey: string,
  spendingPrivateKey: string
): string {
    console.log("i m here >>>")
  const ephemeralPoint = secp.Point.fromHex(ephemeralPublicKey.slice(2));

  console.log(ephemeralPoint,"ephemeralPoint")
  const sharedSecret = secp.getSharedSecret(
    BigInt(viewingPrivateKey).toString(16),
    ephemeralPoint
  );

  const hashedSharedSecret = sha3.keccak_256(Buffer.from(sharedSecret.slice(1)));
  const hashedSharedSecretBigInt = BigInt(`0x${hashedSharedSecret}`);
  const SECP256K1_N = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141";
  
  const n = BigInt(SECP256K1_N);
  
  const stealthPrivateKey = (hashedSharedSecretBigInt + BigInt(spendingPrivateKey)) % n;
  return stealthPrivateKey.toString(16);
}

export async function calculateStealthAddress(recipientKeys: {
  spendingPublicKey: string,
  viewingPublicKey: string
}) {
  // Generate ephemeral key pair
  const ephemeralPrivateKey = secp.utils.randomPrivateKey();
  const ephemeralPublicKey = secp.getPublicKey(ephemeralPrivateKey, true);
  
  // Helper function to properly format hex string
  const fromHexString = (hexString: string) => {
    const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
    // Ensure even length by padding if necessary
    const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
    return Uint8Array.from(paddedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  };
  
  // Convert viewing public key to proper format
  const viewingPubKeyBytes = fromHexString(recipientKeys.viewingPublicKey);
  
  console.log(viewingPubKeyBytes,"viewingPubKeyBytes")
  // Calculate shared secret
  const sharedSecret = secp.getSharedSecret(
    ephemeralPrivateKey,
    viewingPubKeyBytes,
    true
  );
  
  // Generate stealth address using public keys
  const stealthPublicKey = secp.getPublicKey(
    Buffer.from(sha3.keccak_256(Buffer.from(sharedSecret.slice(1))), 'hex'),
    true
  );
  
  const stealthAddress = ethers.computeAddress(`0x${Buffer.from(stealthPublicKey).toString('hex')}`);

  return {
    stealthAddress,
    ephemeralPublicKey: `0x${Buffer.from(ephemeralPublicKey).toString('hex')}`
  };
}

// This function:
// Takes a signature as input
// Generates viewing and spending private keys by hashing the signature
// Derives the corresponding public keys
// Returns both private and public key pairs in the expected format

export async function generateStealthKeys(signature: string): Promise<StealthKeys> {
  // Generate private keys from signature
  const viewingPrivateKey = sha3.keccak_256(signature);
  const spendingPrivateKey = sha3.keccak_256(viewingPrivateKey);
  
  // Generate public keys
  const viewingPublicKey = secp.getPublicKey(viewingPrivateKey, true);
  const spendingPublicKey = secp.getPublicKey(spendingPrivateKey, true);
  
  return {
    viewingPrivateKey: `0x${viewingPrivateKey}`,
    spendingPrivateKey: `0x${spendingPrivateKey}`,
    viewingPublicKey: `0x${Buffer.from(viewingPublicKey).toString('hex')}`,
    spendingPublicKey: `0x${Buffer.from(spendingPublicKey).toString('hex')}`
  };
}

export async function decryptMessage(
  encryptedData: string,
  viewingPrivateKey: string
): Promise<string> {
  try {
    const bytes = ethers.getBytes(encryptedData);
    
    // Split ephemeral public key and encrypted message
    const ephemeralPublicKey = bytes.slice(0, 33);
    const encryptedMessage = bytes.slice(33);
    
    // Convert ephemeral public key to Point
    const ephemeralPoint = secp.Point.fromHex(Buffer.from(ephemeralPublicKey).toString('hex'));
    
    // Calculate shared secret for decryption
    const sharedSecret = secp.getSharedSecret(
      BigInt(viewingPrivateKey).toString(16),
      ephemeralPoint
    );
    
    // Use the shared secret as decryption key
    const key = sha3.keccak_256(Buffer.from(sharedSecret.slice(1)));
    
    // Decrypt message
    const decryptedBytes = encryptedMessage.map((byte, i) => 
      byte ^ parseInt(key.slice(i * 2, (i + 1) * 2), 16)
    );
    
    // Convert bytes back to string
    return new TextDecoder().decode(Buffer.from(decryptedBytes));
  } catch (error) {
    console.error('Error decrypting message:', error);
    return 'Unable to decrypt message';
  }
}