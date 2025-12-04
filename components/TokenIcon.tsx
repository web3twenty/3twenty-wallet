
import React, { useState, useEffect } from 'react';

interface TokenIconProps {
  src?: string;
  symbol: string;
  address: string;
  className?: string;
}

export const TokenIcon: React.FC<TokenIconProps> = ({ src, symbol, address, className = "w-10 h-10" }) => {
  const [error, setError] = useState(false);

  // Reset error state if src changes so we retry loading the new image
  useEffect(() => {
    setError(false);
  }, [src]);

  // Deterministic color generation based on address
  const getGradient = (addr: string) => {
    if (!addr) return "from-slate-600 to-slate-500";
    
    const gradients = [
      "from-blue-500 to-cyan-400",
      "from-purple-500 to-pink-400",
      "from-green-500 to-emerald-400",
      "from-orange-500 to-amber-400",
      "from-red-500 to-rose-400",
      "from-indigo-500 to-violet-400",
      "from-teal-500 to-lime-400",
      "from-fuchsia-500 to-purple-400"
    ];
    let sum = 0;
    for (let i = 0; i < addr.length; i++) {
      sum += addr.charCodeAt(i);
    }
    return gradients[sum % gradients.length];
  };

  const letters = symbol ? symbol.slice(0, 2).toUpperCase() : "??";

  if (src && !error) {
    return (
      <img 
        src={src} 
        alt={symbol} 
        className={`${className} rounded-full object-cover bg-slate-800 shadow-md`}
        onError={() => setError(true)} 
      />
    );
  }

  return (
    <div className={`${className} rounded-full bg-gradient-to-br ${getGradient(address)} flex items-center justify-center text-white shadow-inner border border-white/10 shrink-0`}>
      <span className="text-[0.65rem] sm:text-xs font-bold leading-none select-none drop-shadow-md">{letters}</span>
    </div>
  );
};
