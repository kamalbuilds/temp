import { useState } from 'react';
import { ethers } from 'ethers';
import { calculateStealthAddress, getStealthKeys } from '@/lib/crypto';
import { MIST_CONTRACT_ADDRESS, TOKEN_ADDRESSES } from '@/lib/constants';
import type { TokenType } from '@/lib/types';
import { MIST_ABI, ERC20_ABI } from '@/abi/KeyRegistry';


export default function SendStealth() {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<TokenType>('ETH');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    try {
      setLoading(true);
      
      // Clean and validate address
      const cleanRecipient = recipient.trim();
      if (!cleanRecipient.startsWith('0x')) {
        throw new Error('Address must start with 0x');
      }
      
      // Check if it's a valid hex string after 0x
      const addressWithout0x = cleanRecipient.slice(2);
      if (!/^[0-9a-f]{40}$/i.test(addressWithout0x)) {
        throw new Error('Invalid Ethereum address format');
      }
      
      if (!ethers.isAddress(cleanRecipient)) {
        throw new Error('Invalid Ethereum address checksum');
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Get recipient's stealth keys from registry contract
      try {
        const recipientKeys = await getStealthKeys(cleanRecipient);
        console.log('Recipient keys:', recipientKeys);
        
        if (!recipientKeys.spendingPublicKey || !recipientKeys.viewingPublicKey) {
          throw new Error('Recipient has not registered stealth keys');
        }
        
        // Calculate stealth address
        const { stealthAddress, ephemeralPublicKey } = await calculateStealthAddress(recipientKeys);
        console.log(stealthAddress, ephemeralPublicKey,"stealthAddress");

        const contract = new ethers.Contract(MIST_CONTRACT_ADDRESS, MIST_ABI, signer);
        
        if (selectedToken === 'ETH') {
            console.log("sending eth")
          const tx = await contract.sendEth(
            stealthAddress,
            ephemeralPublicKey,
            '0x', // metadata
            { value: ethers.parseEther(amount) }
          );
          await tx.wait();
        } else {
          const tokenAddress = TOKEN_ADDRESSES[selectedToken];
          const value = ethers.parseUnits(amount, 18);
          
          // Approve token spending
          const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
          const approveTx = await tokenContract.approve(MIST_CONTRACT_ADDRESS, value);
          await approveTx.wait();
          
          // Send tokens
          const tx = await contract.sendERC20(
            stealthAddress,
            tokenAddress,
            value,
            ephemeralPublicKey,
            '0x' // metadata
          );
          await tx.wait();
        }
      } catch (error) {
        if (error.message.includes('BAD_DATA')) {
          throw new Error('Recipient has not registered stealth keys');
        }
        throw error;
      }
      
    } catch (error) {
      console.error('Send error:', error.message);
      // You might want to show this error to the user
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Send Assets</h2>
      
      <div>
        <label className="block mb-2">Recipient Address (Ethereum Wallet Address)</label>
        <input
          type="text"
          placeholder="0x..."
          value={recipient}
          onChange={(e) => {
            // Only allow hexadecimal characters and 0x prefix
            const value = e.target.value.replace(/[^0-9a-fA-Fx]/g, '');
            if (value.startsWith('0x') || value === '0' || value === '') {
              setRecipient(value.toLowerCase());
            } else if (value !== '') {
              setRecipient('0x' + value.toLowerCase());
            }
          }}
          className="w-full p-2 border rounded"
        />
        <p className="text-sm text-gray-500 mt-1">
          Enter the recipient's Ethereum wallet address, not their stealth keys
        </p>
      </div>

      <div>
        <label className="block mb-2">Amount</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 p-2 border rounded"
          />
          <select
            value={selectedToken}
            onChange={(e) => setSelectedToken(e.target.value as TokenType)}
            className="p-2 border rounded"
          >
            <option value="ETH">ETH</option>
            <option value="USDT">USDT</option>
            <option value="USDC">USDC</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleSend}
        disabled={loading}
        className="w-full bg-blue-500 text-white py-2 rounded"
      >
        {loading ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
}