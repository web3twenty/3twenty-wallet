import React from "react";
import { SOCIAL_LINKS, HEADER_LOGO_URL } from "../constants";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 border-t border-slate-800 pt-12 pb-8 mt-auto">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12">
          {/* Brand Column */}
          <div className="space-y-4 max-w-sm">
            <div className="flex items-center gap-2">
              <img src={HEADER_LOGO_URL} alt="3Pay" className="h-10 w-auto" />
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              The secure, non-custodial gateway to the Binance Smart Chain
              ecosystem. Powered by AI, secured by you.
            </p>
          </div>

          {/* Socials */}
          <div className="flex flex-col md:items-end">
            <h3 className="text-white font-bold mb-4">Join Community</h3>
            <div className="flex gap-3">
              <a
                href={SOCIAL_LINKS.twitter}
                target="_blank"
                rel="noreferrer"
                className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-blue-500 hover:text-white transition-all shadow-lg border border-slate-700 hover:border-blue-400"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                </svg>
              </a>
              <a
                href={SOCIAL_LINKS.telegram}
                target="_blank"
                rel="noreferrer"
                className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-blue-400 hover:text-white transition-all shadow-lg border border-slate-700 hover:border-blue-400"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                </svg>
              </a>
              <a
                href={SOCIAL_LINKS.discord}
                target="_blank"
                rel="noreferrer"
                className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-indigo-500 hover:text-white transition-all shadow-lg border border-slate-700 hover:border-indigo-400"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.772-.6083 1.1588a18.2915 18.2915 0 00-5.4882 0 12.6454 12.6454 0 00-.6173-1.1588.0775.0775 0 00-.0785-.0371 19.7363 19.7363 0 00-4.8852 1.5151.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561 19.968 19.968 0 005.9937 3.0333.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057 13.111 13.111 0 01-1.872-1.446.077.077 0 01-.0076-.1006c.1158-.081.2464-.175.3665-.2647a.074.074 0 01.0797-.0121c3.9315 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0817.0123c.112.0892.2468.1845.3635.2647a.077.077 0 01-.0053.1007 13.134 13.134 0 01-1.8698 1.4466.0784.0784 0 00-.0407.1067c.3604.6982.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286 19.9007 19.9007 0 006.0028-3.0338.077.077 0 00.0322-.054c.4917-4.6291-.5271-9.2835-2.2886-13.6648a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 text-center text-sm text-slate-500">
          <p>
            © {new Date().getFullYear()} 3Twenty Wallet. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
