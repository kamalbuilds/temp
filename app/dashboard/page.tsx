"use client"
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { MIST_CONTRACT_ADDRESS } from '@/lib/constants';
import { MIST_ABI } from '@/abi/KeyRegistry';
import { calculateStealthPrivateKey } from '@/lib/crypto';
import type { StealthEvent } from '@/lib/types';

export default function StealthMonitor() {
  const [events, setEvents] = useState<StealthEvent[]>([]);
  const [loading, setLoading] = useState(false);

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

  const checkIfStealthIsOurs = async (event: StealthEvent) => {
    const keys = localStorage.getItem('stealthKeys');
    if (!keys) return false;

    const { viewingPrivateKey, spendingPrivateKey } = JSON.parse(keys);
    if (!viewingPrivateKey || !spendingPrivateKey) return false;

    try {
      const privateKey = calculateStealthPrivateKey(
        event.ephemeralPubKey,
        viewingPrivateKey,
        spendingPrivateKey
      );
      
      const address = ethers.computeAddress(`0x${privateKey}`);
      return address.toLowerCase() === event.stealthAddress.toLowerCase();
    } catch (error) {
      console.error('Error checking stealth address:', error);
      return false;
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Stealth Transactions</h2>
      
      {loading ? (
        <div>Loading transactions...</div>
      ) : (
        <div className="space-y-4">
          {events.map((event, index) => (
            <div key={index} className="p-4 border rounded">
              <div>From: {event.caller}</div>
              <div>To: {event.stealthAddress}</div>
              <div>Amount: {event.valueInEther} ETH</div>
              <button 
                onClick={() => checkIfStealthIsOurs(event)}
                className="mt-2 bg-blue-500 text-white px-4 py-2 rounded"
              >
                Check if mine
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}