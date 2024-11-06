import { useState } from 'react';
import { generateStealthKeys, registerKeys } from '@/lib/crypto';
import type { StealthKeys } from '@/lib/types';
import { ethers } from 'ethers';

export default function SetupKeys() {
  const [keys, setKeys] = useState<StealthKeys | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const handleSetup = async () => {
    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const message = 'Sign this message to generate your stealth keys';
      const messageBytes = ethers.toUtf8Bytes(message);
      const signature = await signer.signMessage(messageBytes);
      
      const keys = await generateStealthKeys(signature);
      setKeys(keys);
      
      // Save keys to local storage
      localStorage.setItem('stealthKeys', JSON.stringify(keys));
      
      // Register keys on-chain
      await registerKeys(keys);
      setRegistered(true);
      
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Setup Stealth Keys</h2>
      
      {!keys ? (
        <button
          onClick={handleSetup}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          {loading ? 'Generating...' : 'Generate Keys'}
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Spending Public Key</h3>
            <p className="break-all">{keys.spendingPublicKey}</p>
          </div>
          <div>
            <h3 className="font-semibold">Spending Private Key</h3>
            <p className="break-all text-red-500">{keys.spendingPrivateKey}</p>
            <p className="text-sm text-red-600">Keep this secret! Never share it!</p>
          </div>
          <div>
            <h3 className="font-semibold">Viewing Public Key</h3>
            <p className="break-all">{keys.viewingPublicKey}</p>
          </div>
          <div>
            <h3 className="font-semibold">Viewing Private Key</h3>
            <p className="break-all text-red-500">{keys.viewingPrivateKey}</p>
            <p className="text-sm text-red-600">Keep this secret! Never share it!</p>
          </div>
          {registered && (
            <div className="text-green-500 font-semibold">
              ✓ Keys registered on-chain
            </div>
          )}
        </div>
      )}
    </div>
  );
}