"use client"
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { calculateStealthPrivateKey, decryptMessage } from '@/lib/crypto';
import type { StealthEvent } from '@/lib/types';
import { MIST_ABI } from '@/abi/KeyRegistry';
import { MIST_CONTRACT_ADDRESS } from '@/lib/constants';

export default function ClaimStealth() {
  const [events, setEvents] = useState<StealthEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimableEvents, setClaimableEvents] = useState<StealthEvent[]>([]);

  // Reuse the events fetching logic from StealthMonitor
  useEffect(() => {
    const pollEvents = async () => {
      try {
        setLoading(true);
        const provider = new ethers.JsonRpcProvider('https://sepolia.gateway.tenderly.co');
        const contract = new ethers.Contract(MIST_CONTRACT_ADDRESS, MIST_ABI, provider);
        
        const latestBlock = await provider.getBlockNumber();
        const fromBlock = latestBlock - 5000; // Last 5000 blocks
        
        const events = await contract.queryFilter('Announcement', fromBlock, latestBlock);
        
        const formattedEvents = await Promise.all(
          events.map(async (event) => {
            const tx = await provider.getTransaction(event.transactionHash);
            return {
              schemeId: event.args?.schemeId.toString(),
              stealthAddress: event.args?.stealthAddress,
              caller: event.args?.caller,
              ephemeralPubKey: ethers.hexlify(event.args?.ephemeralPubKey),
              metadata: ethers.hexlify(event.args?.metadata),
              valueInEther: ethers.formatEther(tx?.value ?? 0)
            };
          })
        );

        setEvents(formattedEvents);
      } catch (error) {
        console.error('Error polling events:', error);
      } finally {
        setLoading(false);
      }
    };

    pollEvents();
    const interval = setInterval(pollEvents, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, []);
  
  const checkAndClaimFunds = async (event: StealthEvent) => {
    try {

        console.log(event.stealthAddress,"event.stealthAddress")
      const keys = localStorage.getItem('stealthKeys');
      if (!keys) {
        alert('No stealth keys found. Please set up your keys first.');
        return;
      }

      const { viewingPrivateKey, spendingPrivateKey } = JSON.parse(keys);
      if (!viewingPrivateKey || !spendingPrivateKey) {
        alert('Invalid stealth keys.');
        return;
      }

      // Calculate the stealth private key
      const stealthPrivateKey = calculateStealthPrivateKey(
        event.ephemeralPubKey,
        viewingPrivateKey,
        spendingPrivateKey
      );

      console.log(stealthPrivateKey,"stealthPrivateKey")

      // Create wallet from stealth private key
      const stealthWallet = new ethers.Wallet(
        `0x${stealthPrivateKey}`,
        new ethers.JsonRpcProvider('https://sepolia.gateway.tenderly.co')
      );

      console.log(stealthWallet.address,"stealthWallet.address")
      console.log(stealthWallet.address.toLowerCase() === event.stealthAddress.toLowerCase())
      // If the address matches, claim the funds
      if (stealthWallet.address.toLowerCase() === event.stealthAddress.toLowerCase()) {
        // Try to decrypt message if metadata exists
        let message = '';
        if (event.metadata && event.metadata !== '0x') {
          message = await decryptMessage(event.metadata, viewingPrivateKey);
        }

        const tx = await stealthWallet.sendTransaction({
          to: (await window.ethereum.request({ method: 'eth_requestAccounts' }))[0],
          value: ethers.parseEther(event.valueInEther)
        });
        
        await tx.wait();
        alert(`Funds claimed successfully!\n${message ? `Message: ${message}` : ''}`);
      }
    } catch (error) {
      console.error('Error claiming funds:', error);
      alert('Error claiming funds: ' + error.message);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Claim Stealth Funds</h2>
      
      {loading ? (
        <div>Loading transactions...</div>
      ) : (
        <div className="space-y-4">
          {events.map((event, index) => (
            <div key={index} className="p-4 border rounded">
              <div>From: {event.caller}</div>
              <div>To: {event.stealthAddress}</div>
              <div>Amount: {event.valueInEther} ETH</div>
              {event.metadata && event.metadata !== '0x' && (
                <div>Encrypted Message: {event.metadata}</div>
              )}
              <button 
                onClick={() => checkAndClaimFunds(event)}
                className="mt-2 bg-green-500 text-white px-4 py-2 rounded"
              >
                Claim Funds
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}