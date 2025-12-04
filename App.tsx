
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { ViewState, WalletAccount, Token, VaultData } from './types';
import { 
  createWallet, 
  importWalletFromMnemonic, 
  importWalletFromPrivateKey, 
  getTokenBalance, 
  sendToken, 
  fetchTokenInfo, 
  formatAddress,
  encryptVault,
  decryptVault
} from './services/cryptoService';
import { askGemini } from './services/geminiService';
import { DEFAULT_TOKENS, TOKEN_3TWENTY_SYMBOL } from './constants';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { TokenIcon } from './components/TokenIcon';

export default function App() {
  // --- Global State ---
  const [view, setView] = useState<ViewState>(ViewState.UNLOCK);
  const [password, setPassword] = useState<string>("");
  
  // --- Vault State ---
  const [wallets, setWallets] = useState<WalletAccount[]>([]);
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>(DEFAULT_TOKENS.map(t => ({ ...t, balance: "0" })));
  
  // --- UI State ---
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // --- Input Forms ---
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");

  const [importInput, setImportInput] = useState("");
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [selectedTokenForSend, setSelectedTokenForSend] = useState<Token | null>(null);
  
  // Import Token State
  const [importTokenAddress, setImportTokenAddress] = useState("");
  const [importTokenPreview, setImportTokenPreview] = useState<Token | null>(null);

  const [authPassword, setAuthPassword] = useState(""); // For sensitive actions like exporting keys

  // --- Onboarding / Seed State ---
  const [tempWallet, setTempWallet] = useState<WalletAccount | null>(null);
  const [seedVerifyIndices, setSeedVerifyIndices] = useState<number[]>([]);
  const [seedVerifyInputs, setSeedVerifyInputs] = useState<{[key: number]: string}>({});

  // --- AI Chat ---
  const [showAiChat, setShowAiChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const activeWallet = wallets.find(w => w.id === activeWalletId);

  // --- Initialization ---
  useEffect(() => {
    const vault = localStorage.getItem('3twenty_vault');
    if (!vault) {
      setView(ViewState.SETUP_PASSWORD);
    } else {
      setView(ViewState.UNLOCK);
    }
  }, []);

  // --- Persistence ---
  const saveVault = useCallback((currentWallets: WalletAccount[], currentTokens: Token[], currentPassword: string) => {
    if (!currentPassword) return;
    const vaultData: VaultData = {
      wallets: currentWallets,
      customTokens: currentTokens.filter(t => !DEFAULT_TOKENS.find(dt => dt.address === t.address))
    };
    try {
      const encrypted = encryptVault(vaultData, currentPassword);
      localStorage.setItem('3twenty_vault', encrypted);
    } catch (e) {
      console.error("Failed to save vault", e);
    }
  }, []);

  useEffect(() => {
    if (password && wallets.length > 0) {
      saveVault(wallets, tokens, password);
    }
  }, [wallets, tokens, password, saveVault]);

  // --- Balance Fetching ---
  const fetchBalances = useCallback(async () => {
    if (!activeWallet) return;
    setIsLoading(true);
    try {
      const updatedTokens = await Promise.all(tokens.map(async (token) => {
        let balance = "0";
        const balInfo = await getTokenBalance(activeWallet.address, token.address);
        balance = balInfo.balance;
        return { ...token, balance };
      }));
      setTokens(updatedTokens);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [activeWallet, tokens]);

  useEffect(() => {
    if (view === ViewState.DASHBOARD && activeWallet) {
      fetchBalances();
    }
  }, [view, activeWallet, fetchBalances]);

  // --- Handlers: Security ---

  const handleSetupPassword = () => {
    if (setupPassword.length < 4) {
      setStatusMessage({ type: 'error', text: 'Password must be at least 4 characters.' });
      return;
    }
    if (setupPassword !== setupConfirm) {
      setStatusMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    setPassword(setupPassword);
    setView(ViewState.ONBOARDING);
    setStatusMessage(null);
  };

  const handleUnlock = () => {
    const vault = localStorage.getItem('3twenty_vault');
    if (!vault) return;
    
    try {
      const data = decryptVault(vault, unlockPassword);
      setWallets(data.wallets);
      
      // Merge stored custom tokens with default tokens
      const mergedTokens: Token[] = DEFAULT_TOKENS.map(t => ({ ...t, balance: "0" }));
      
      if (data.customTokens) {
         data.customTokens.forEach(ct => {
           if (!mergedTokens.find(t => t.address.toLowerCase() === ct.address.toLowerCase())) {
             mergedTokens.push(ct);
           }
         });
      }
      setTokens(mergedTokens);

      if (data.wallets.length > 0) {
        setActiveWalletId(data.wallets[0].id);
        setView(ViewState.DASHBOARD);
      } else {
        setView(ViewState.ONBOARDING);
      }
      setPassword(unlockPassword);
      setStatusMessage(null);
    } catch (e) {
      setStatusMessage({ type: 'error', text: 'Incorrect password.' });
    }
  };

  const handleResetApp = () => {
    if (window.confirm("This will PERMANENTLY delete all wallets and keys stored in this browser. Ensure you have backed up your seed phrases. Continue?")) {
      try {
        localStorage.clear();
        setWallets([]);
        setTokens(DEFAULT_TOKENS);
        setPassword("");
        setView(ViewState.SETUP_PASSWORD);
        window.location.reload();
      } catch (e) {
        console.error("Reset failed", e);
        window.location.reload();
      }
    }
  };

  // --- Handlers: Wallet Creation Flow ---

  const handleStartCreateWallet = () => {
    const wallet = createWallet();
    const newWallet: WalletAccount = {
      id: Date.now().toString(),
      name: `Wallet ${wallets.length + 1}`,
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic
    };
    setTempWallet(newWallet);
    setView(ViewState.SEED_BACKUP);
    setStatusMessage(null);
  };

  const handleSeedBackupConfirmed = () => {
    // Generate 3 random indices from 0-11
    const indices = [];
    const available = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (let i = 0; i < 3; i++) {
      const rand = Math.floor(Math.random() * available.length);
      indices.push(available[rand]);
      available.splice(rand, 1);
    }
    setSeedVerifyIndices(indices.sort((a, b) => a - b));
    setSeedVerifyInputs({});
    setView(ViewState.SEED_VERIFY);
  };

  const handleVerifySeed = () => {
    if (!tempWallet || !tempWallet.mnemonic) return;
    const words = tempWallet.mnemonic.split(" ");
    
    let isValid = true;
    for (const idx of seedVerifyIndices) {
      if (seedVerifyInputs[idx]?.trim().toLowerCase() !== words[idx].toLowerCase()) {
        isValid = false;
        break;
      }
    }

    if (isValid) {
      const updatedWallets = [...wallets, tempWallet];
      setWallets(updatedWallets);
      setActiveWalletId(tempWallet.id);
      setTempWallet(null);
      // Explicitly save here to ensure vault is created if this is the first wallet
      saveVault(updatedWallets, tokens, password);
      setView(ViewState.DASHBOARD);
      setStatusMessage({ type: 'success', text: 'Wallet created successfully!' });
    } else {
      setStatusMessage({ type: 'error', text: 'Incorrect words. Please try again.' });
    }
  };

  // --- Handlers: Other Actions ---

  const handleImportWallet = () => {
    try {
      let wallet;
      let mnemonic = "";
      if (importInput.includes(" ")) {
        const res = importWalletFromMnemonic(importInput);
        wallet = res;
        mnemonic = res.mnemonic;
      } else {
        wallet = importWalletFromPrivateKey(importInput);
      }
      const newWallet: WalletAccount = {
        id: Date.now().toString(),
        name: `Imported ${wallets.length + 1}`,
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: mnemonic // Will be empty if imported by PK
      };
      const updated = [...wallets, newWallet];
      setWallets(updated);
      setActiveWalletId(newWallet.id);
      setImportInput("");
      setView(ViewState.DASHBOARD);
      setStatusMessage({ type: 'success', text: 'Wallet imported successfully!' });
    } catch (e) {
      setStatusMessage({ type: 'error', text: 'Invalid mnemonic or private key.' });
    }
  };

  const handleCheckToken = async () => {
    if (!ethers.isAddress(importTokenAddress)) {
      setStatusMessage({ type: 'error', text: 'Invalid contract address.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);
    setImportTokenPreview(null);
    
    try {
      if (tokens.find(t => t.address.toLowerCase() === importTokenAddress.toLowerCase())) {
        setStatusMessage({ type: 'error', text: 'Token already added.' });
        return;
      }

      const info = await fetchTokenInfo(importTokenAddress);
      
      if (info && info.address) {
        const newToken: Token = {
          address: info.address!,
          symbol: info.symbol || "UNK",
          name: info.name || "Unknown Token",
          decimals: info.decimals || 18,
          balance: "0",
          logoUrl: info.logoUrl || "" // Use fetched logo or empty string for fallback
        };
        setImportTokenPreview(newToken);
      } else {
        setStatusMessage({ type: 'error', text: 'Could not fetch token info. Check address and network.' });
      }
    } catch (e) {
      setStatusMessage({ type: 'error', text: 'Error fetching token info.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImportToken = () => {
    if (!importTokenPreview) return;
    
    setTokens([...tokens, importTokenPreview]);
    setImportTokenAddress("");
    setImportTokenPreview(null);
    setView(ViewState.DASHBOARD);
    setStatusMessage({ type: 'success', text: `Imported ${importTokenPreview.symbol}` });
  };

  const handleSend = async () => {
    if (!activeWallet || !selectedTokenForSend) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      let txHash = "";
      txHash = await sendToken(activeWallet.privateKey, sendAddress, selectedTokenForSend.address, sendAmount);
      setStatusMessage({ type: 'success', text: `Sent! Tx: ${formatAddress(txHash)}` });
      setSendAddress("");
      setSendAmount("");
      // Refresh balances after delay
      setTimeout(fetchBalances, 5000);
      setTimeout(() => setView(ViewState.DASHBOARD), 2000);
    } catch (e: any) {
      console.error(e);
      setStatusMessage({ type: 'error', text: 'Transaction failed. Check balance & gas.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAiAsk = async () => {
    if (!chatInput.trim()) return;
    const prompt = chatInput;
    setChatInput("");
    setChatHistory(prev => [...prev, { role: 'user', text: prompt }]);
    setIsAiThinking(true);

    const walletContext = activeWallet ? `
      Active Wallet: ${activeWallet.address}
      Balances: ${tokens.map(t => `${t.balance} ${t.symbol}`).join(", ")}
      Current View: ${view}
    ` : "User is not logged in.";

    const response = await askGemini(prompt, walletContext);
    setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    setIsAiThinking(false);
  };

  // --- Views ---

  // 1. Setup Password
  if (view === ViewState.SETUP_PASSWORD) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
           <h1 className="text-2xl font-bold text-blue-400 mb-4 text-center">Set App Password</h1>
           <p className="text-slate-400 text-sm mb-6 text-center">This password will encrypt your keys on this device.</p>
           <div className="space-y-4">
             <input type="password" placeholder="New Password" value={setupPassword} onChange={e => setSetupPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none" />
             <input type="password" placeholder="Confirm Password" value={setupConfirm} onChange={e => setSetupConfirm(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none" />
             <Button onClick={handleSetupPassword} className="w-full">Set Password</Button>
           </div>
           {statusMessage && <p className="text-red-400 text-sm text-center mt-4">{statusMessage.text}</p>}
        </Card>
      </div>
    );
  }

  // 2. Unlock
  if (view === ViewState.UNLOCK) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
           <div className="flex justify-center mb-6">
             <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold">3T</div>
           </div>
           <h1 className="text-2xl font-bold text-white mb-2 text-center">Welcome Back</h1>
           <p className="text-slate-400 text-sm mb-6 text-center">Enter your password to unlock your wallet.</p>
           <div className="space-y-4">
             <input 
               type="password" 
               placeholder="Password" 
               value={unlockPassword} 
               onChange={e => setUnlockPassword(e.target.value)} 
               onKeyDown={e => e.key === 'Enter' && handleUnlock()}
               className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-blue-500" 
             />
             <Button onClick={handleUnlock} className="w-full">Unlock</Button>
             <div className="text-center mt-4">
                <button 
                  onClick={handleResetApp} 
                  className="text-xs text-red-500 hover:text-red-400 underline"
                >
                  Reset App & Wipe Data
                </button>
             </div>
           </div>
           {statusMessage && <p className="text-red-400 text-sm text-center mt-4">{statusMessage.text}</p>}
        </Card>
      </div>
    );
  }

  // 3. Onboarding Main
  if (view === ViewState.ONBOARDING) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-blue-400 mb-2">3Twenty Wallet</h1>
            <p className="text-slate-400">Secure. Fast. AI-Powered.</p>
          </div>
          
          <div className="space-y-4">
            <Button onClick={handleStartCreateWallet} className="w-full py-4 text-lg">
              Create New Wallet
            </Button>
            
            <div className="relative my-6">
               <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700"></div></div>
               <div className="relative flex justify-center text-sm"><span className="px-2 bg-slate-800 text-slate-400">Or import</span></div>
            </div>

            <textarea
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
              placeholder="Enter Private Key or Mnemonic"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 outline-none"
              rows={3}
            />
            <Button onClick={handleImportWallet} variant="secondary" className="w-full" disabled={!importInput}>
              Import Wallet
            </Button>
          </div>
          {statusMessage && <p className="text-red-400 text-sm text-center mt-4">{statusMessage.text}</p>}
        </Card>
      </div>
    );
  }

  // 4. Seed Backup
  if (view === ViewState.SEED_BACKUP && tempWallet && tempWallet.mnemonic) {
    const words = tempWallet.mnemonic.split(' ');
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <h2 className="text-xl font-bold mb-2 text-white">Secret Recovery Phrase</h2>
          <p className="text-slate-400 text-sm mb-4">Write down these 12 words in order. This is the only way to recover your wallet.</p>
          
          <div className="grid grid-cols-3 gap-3 mb-6">
            {words.map((word, i) => (
              <div key={i} className="bg-slate-900 p-2 rounded border border-slate-700 flex gap-2 items-center">
                <span className="text-slate-500 text-xs w-4">{i+1}.</span>
                <span className="font-mono text-sm">{word}</span>
              </div>
            ))}
          </div>
          
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setView(ViewState.ONBOARDING)}>Back</Button>
            <Button className="flex-1" onClick={handleSeedBackupConfirmed}>I have saved it</Button>
          </div>
        </Card>
      </div>
    );
  }

  // 5. Seed Verify
  if (view === ViewState.SEED_VERIFY && tempWallet) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <h2 className="text-xl font-bold mb-2 text-white">Verify Recovery Phrase</h2>
          <p className="text-slate-400 text-sm mb-6">Please confirm words #{seedVerifyIndices.map(i => i+1).join(', #')} to verify your backup.</p>
          
          <div className="space-y-4 mb-6">
            {seedVerifyIndices.map((idx) => (
              <div key={idx}>
                <label className="block text-sm text-slate-300 mb-1">Word #{idx+1}</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 outline-none focus:border-blue-500"
                  onChange={(e) => setSeedVerifyInputs({...seedVerifyInputs, [idx]: e.target.value})}
                  value={seedVerifyInputs[idx] || ""}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-3">
             <Button variant="secondary" onClick={() => setView(ViewState.SEED_BACKUP)}>Back</Button>
             <Button className="flex-1" onClick={handleVerifySeed}>Verify & Create</Button>
          </div>
          {statusMessage && <p className="text-red-400 text-sm text-center mt-4">{statusMessage.text}</p>}
        </Card>
      </div>
    );
  }

  // Main App Scaffolding
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      {/* Header */}
      <header className="bg-slate-900/50 backdrop-blur border-b border-slate-800 p-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView(ViewState.DASHBOARD)}>
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold">3T</div>
            <span className="font-bold hidden sm:block">3Twenty Wallet</span>
          </div>
          
          <div className="flex items-center gap-3">
             {activeWallet && (
               <div className="relative group">
                  <button className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full text-xs font-mono border border-slate-700 transition-colors flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    {activeWallet.name}
                  </button>
                  {/* Account Switcher */}
                  <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-2 hidden group-hover:block z-50">
                    <div className="text-xs text-slate-500 px-2 py-1 uppercase font-bold">My Wallets</div>
                    {wallets.map(w => (
                      <div 
                        key={w.id} 
                        onClick={() => { setActiveWalletId(w.id); setView(ViewState.DASHBOARD); }}
                        className={`p-2 rounded-lg cursor-pointer text-sm mb-1 flex justify-between items-center ${activeWalletId === w.id ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-700'}`}
                      >
                        <div>
                          <div className="font-medium">{w.name}</div>
                          <div className="text-xs text-slate-500 truncate w-24">{formatAddress(w.address)}</div>
                        </div>
                        {activeWalletId === w.id && <span>✓</span>}
                      </div>
                    ))}
                    <div className="h-px bg-slate-700 my-1"></div>
                    <div 
                      onClick={() => setView(ViewState.ONBOARDING)}
                      className="p-2 rounded-lg cursor-pointer text-sm hover:bg-slate-700 text-blue-400 flex items-center gap-2"
                    >
                      <span>+ Add / Import Wallet</span>
                    </div>
                    <div 
                      onClick={() => {
                        setAuthPassword("");
                        setStatusMessage(null);
                        setView(ViewState.WALLET_DETAILS);
                      }}
                      className="p-2 rounded-lg cursor-pointer text-sm hover:bg-slate-700 text-slate-300 flex items-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      <span>Settings & Keys</span>
                    </div>
                  </div>
               </div>
             )}
             
             <button onClick={() => setShowAiChat(!showAiChat)} className="bg-purple-600/20 text-purple-400 border border-purple-500/30 p-2 rounded-full hover:bg-purple-600/30 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
             </button>
             <button onClick={() => setView(ViewState.UNLOCK)} title="Lock Wallet" className="bg-slate-800 text-slate-400 p-2 rounded-full hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {statusMessage && (
          <div className={`p-4 rounded-lg flex items-center justify-between ${statusMessage.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)}>&times;</button>
          </div>
        )}

        {/* DASHBOARD */}
        {view === ViewState.DASHBOARD && activeWallet && (
          <>
            <Card className="text-center py-8 bg-gradient-to-br from-slate-800 to-slate-900">
              <p className="text-slate-400 text-sm mb-1">Total Balance</p>
              <h2 className="text-4xl font-bold text-white mb-6">
                {tokens.find(t => t.symbol === TOKEN_3TWENTY_SYMBOL)?.balance || "0.00"} <span className="text-xl text-blue-400">{TOKEN_3TWENTY_SYMBOL}</span>
              </h2>
              
              <div className="flex justify-center gap-4">
                <Button onClick={() => setView(ViewState.SEND)}>Send</Button>
                <Button variant="secondary" onClick={() => setView(ViewState.RECEIVE)}>Receive</Button>
              </div>
            </Card>

            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Assets</h3>
              <button onClick={() => { setImportTokenAddress(""); setImportTokenPreview(null); setView(ViewState.IMPORT_TOKEN); }} className="text-sm text-blue-400 hover:text-blue-300">+ Import Token</button>
            </div>

            <div className="space-y-3">
              {tokens.map((token) => (
                <Card key={token.address} className="flex items-center justify-between p-4 hover:bg-slate-800 transition-colors">
                  <div className="flex items-center gap-3">
                    <TokenIcon src={token.logoUrl} symbol={token.symbol} address={token.address} />
                    <div>
                      <div className="font-semibold">{token.name}</div>
                      <div className="text-xs text-slate-400">{token.symbol}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-medium">{parseFloat(token.balance).toFixed(4)}</div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* WALLET DETAILS (EXPORT KEYS) */}
        {view === ViewState.WALLET_DETAILS && activeWallet && (
          <Card>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setView(ViewState.DASHBOARD)} className="p-1 hover:bg-slate-700 rounded">←</button>
              <h2 className="text-xl font-bold">Wallet Settings & Security</h2>
            </div>
            
            <div className="space-y-6">
               <div className="p-4 bg-slate-900 rounded-lg">
                 <label className="text-xs text-slate-500 uppercase font-bold">Wallet Name</label>
                 <div className="text-lg">{activeWallet.name}</div>
               </div>
               
               <div className="p-4 border border-red-500/30 bg-red-500/10 rounded-lg">
                  <h3 className="text-red-400 font-bold mb-2">Export Private Key</h3>
                  <p className="text-sm text-slate-400 mb-4">Warning: Never share your private key or mnemonic with anyone. Anyone with this key can steal your funds.</p>
                  
                  {authPassword === password ? (
                    <div className="space-y-4 animate-in fade-in duration-300">
                       <div>
                         <label className="text-xs text-slate-500">Private Key</label>
                         <div className="flex gap-2">
                           <input readOnly value={activeWallet.privateKey} className="w-full bg-slate-950 p-2 rounded text-xs font-mono text-slate-300" />
                           <Button variant="secondary" onClick={() => navigator.clipboard.writeText(activeWallet.privateKey)} className="text-xs">Copy</Button>
                         </div>
                       </div>
                       
                       {activeWallet.mnemonic && (
                         <div>
                           <label className="text-xs text-slate-500">Mnemonic Phrase</label>
                           <div className="flex gap-2">
                             <textarea readOnly value={activeWallet.mnemonic} className="w-full bg-slate-950 p-2 rounded text-xs font-mono text-slate-300" rows={2} />
                             <Button variant="secondary" onClick={() => navigator.clipboard.writeText(activeWallet.mnemonic!)} className="text-xs">Copy</Button>
                           </div>
                         </div>
                       )}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                       <input 
                         type="password" 
                         placeholder="Enter App Password to Reveal" 
                         className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 outline-none"
                         value={authPassword}
                         onChange={e => setAuthPassword(e.target.value)}
                       />
                       {authPassword && authPassword !== password && <span className="text-red-500 self-center text-sm">Wrong</span>}
                    </div>
                  )}
               </div>
            </div>
          </Card>
        )}

        {/* SEND VIEW */}
        {view === ViewState.SEND && (
          <Card>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setView(ViewState.DASHBOARD)} className="p-1 hover:bg-slate-700 rounded">←</button>
              <h2 className="text-xl font-bold">Send Assets</h2>
            </div>
            <div className="space-y-4">
               <div>
                 <label className="block text-sm text-slate-400 mb-1">Select Asset</label>
                 <select 
                   className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none"
                   onChange={(e) => {
                     const t = tokens.find(tk => tk.address === e.target.value);
                     setSelectedTokenForSend(t || null);
                   }}
                   value={selectedTokenForSend?.address || ""}
                 >
                   <option value="">Select Token</option>
                   {tokens.map(t => (
                     <option key={t.address} value={t.address}>{t.symbol} - Balance: {parseFloat(t.balance).toFixed(4)}</option>
                   ))}
                 </select>
               </div>
               <div>
                 <label className="block text-sm text-slate-400 mb-1">Recipient Address</label>
                 <input type="text" value={sendAddress} onChange={(e) => setSendAddress(e.target.value)} placeholder="0x..." className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none" />
               </div>
               <div>
                 <label className="block text-sm text-slate-400 mb-1">Amount</label>
                 <div className="relative">
                    <input type="number" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="0.00" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none" />
                    <button onClick={() => setSendAmount(selectedTokenForSend?.balance || "0")} className="absolute right-2 top-2 text-xs bg-slate-800 px-2 py-1 rounded text-blue-400">MAX</button>
                 </div>
               </div>
               <Button onClick={handleSend} className="w-full mt-4" isLoading={isLoading} disabled={!selectedTokenForSend || !sendAddress || !sendAmount}>
                 Send {selectedTokenForSend?.symbol}
               </Button>
            </div>
          </Card>
        )}

        {/* RECEIVE VIEW */}
        {view === ViewState.RECEIVE && activeWallet && (
          <Card className="text-center">
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setView(ViewState.DASHBOARD)} className="p-1 hover:bg-slate-700 rounded">←</button>
              <h2 className="text-xl font-bold">Receive Assets</h2>
            </div>
            <div className="bg-white p-4 rounded-xl inline-block mb-6">
               <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${activeWallet.address}`} alt="Wallet QR" className="w-48 h-48" />
            </div>
            <div className="bg-slate-900 p-3 rounded-lg flex items-center justify-between gap-2 max-w-sm mx-auto">
              <span className="text-sm font-mono truncate text-slate-300">{activeWallet.address}</span>
              <button onClick={() => { navigator.clipboard.writeText(activeWallet.address); setStatusMessage({ type: 'success', text: 'Address copied!' }); }} className="p-2 hover:bg-slate-800 rounded text-blue-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-4">Only send BSC (BEP20) assets to this address.</p>
          </Card>
        )}

        {/* IMPORT TOKEN */}
        {view === ViewState.IMPORT_TOKEN && (
          <Card>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setView(ViewState.DASHBOARD)} className="p-1 hover:bg-slate-700 rounded">←</button>
              <h2 className="text-xl font-bold">Import Custom Token</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Token Contract Address</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={importTokenAddress} 
                    onChange={(e) => { setImportTokenAddress(e.target.value); setImportTokenPreview(null); }} 
                    placeholder="0x..." 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none" 
                  />
                  {!importTokenPreview && (
                    <Button onClick={handleCheckToken} isLoading={isLoading} disabled={!ethers.isAddress(importTokenAddress)}>
                      Check
                    </Button>
                  )}
                </div>
              </div>

              {importTokenPreview && (
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="text-sm text-slate-400 mb-2">Token Found</div>
                  <div className="flex items-center gap-4 mb-4">
                     <TokenIcon src={importTokenPreview.logoUrl} symbol={importTokenPreview.symbol} address={importTokenPreview.address} className="w-12 h-12" />
                     <div>
                        <div className="font-bold text-lg text-white">{importTokenPreview.name}</div>
                        <div className="text-blue-400 text-sm font-mono">{importTokenPreview.symbol}</div>
                     </div>
                  </div>
                  <div className="flex justify-between items-center mb-4 text-xs text-slate-500">
                     <span>Decimals: {importTokenPreview.decimals}</span>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="ghost" onClick={() => setImportTokenPreview(null)} className="flex-1">Cancel</Button>
                    <Button onClick={handleConfirmImportToken} className="flex-1">Import Token</Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </main>

      {/* AI CHAT */}
      {showAiChat && (
        <div className="fixed bottom-0 right-0 md:right-4 md:bottom-4 w-full md:w-96 h-[500px] bg-slate-900 border border-slate-700 rounded-t-xl md:rounded-xl shadow-2xl flex flex-col z-50">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800 rounded-t-xl">
             <div className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span><span className="font-semibold">3Twenty Assistant</span></div>
             <button onClick={() => setShowAiChat(false)} className="text-slate-400 hover:text-white">&times;</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
             {chatHistory.length === 0 && <div className="text-center text-slate-500 mt-10"><p>Ask me anything about your wallet or crypto!</p></div>}
             {chatHistory.map((msg, idx) => (
               <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                 <div className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200'}`}>{msg.text}</div>
               </div>
             ))}
             {isAiThinking && <div className="flex justify-start"><div className="bg-slate-700 p-3 rounded-lg text-sm text-slate-400 italic">Thinking...</div></div>}
          </div>
          <div className="p-3 border-t border-slate-800 flex gap-2">
            <input className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" placeholder="Type a message..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiAsk()} />
            <Button onClick={handleAiAsk} disabled={isAiThinking || !chatInput} className="px-3">Send</Button>
          </div>
        </div>
      )}
    </div>
  );
}
