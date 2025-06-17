import Link from 'next/link';
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from '@coinbase/onchainkit/wallet';
import {
  Name,
  Identity,
  Address,
  Avatar,
  EthBalance,
} from '@coinbase/onchainkit/identity';
import { Button } from '@/components/ui/button';
import { Chain } from 'wagmi/chains';

interface PageHeaderProps {
  pageType: 'premium' | 'trial';
  targetChain: Chain;
  isConnected: boolean;
  isOnCorrectChain: boolean;
  isSwitchingChain: boolean;
  handleSwitchChain: () => void;
}

export function PageHeader({
  pageType,
  targetChain,
  isConnected,
  isOnCorrectChain,
  isSwitchingChain,
  handleSwitchChain,
}: PageHeaderProps) {
  const pageTitle = pageType === 'trial' ? 'TrueCast API - Free Trial' : 'TrueCast API';

  return (
    <div className="mb-8 flex justify-between items-center">
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild>
          <Link href="/" className="font-mono">
            ← Back to Home
          </Link>
        </Button>
      </div>
      
      {!isConnected ? (
        <Wallet>
          <ConnectWallet>
            <Name className="text-primary font-mono" />
          </ConnectWallet>
          <WalletDropdown>
            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
              <Avatar />
              <Name className="text-primary" />
              <Address className="font-mono text-sm text-primary/80" />
              <EthBalance className="text-primary/90" />
            </Identity>
            <WalletDropdownDisconnect className="text-primary hover:text-primary/80" />
          </WalletDropdown>
        </Wallet>
      ) : !isOnCorrectChain ? (
        <Button
          onClick={handleSwitchChain}
          disabled={isSwitchingChain}
          className="font-mono bg-primary hover:bg-primary/90"
        >
          {isSwitchingChain ? 'Switching...' : `Switch to ${targetChain.name}`}
        </Button>
      ) : (
        <Wallet>
          <ConnectWallet>
            <Name className="text-primary font-mono" />
          </ConnectWallet>
          <WalletDropdown>
            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
              <Avatar />
              <Name className="text-primary" />
              <Address className="font-mono text-sm text-primary/80" />
              <EthBalance className="text-primary/90" />
            </Identity>
            <WalletDropdownDisconnect className="text-primary hover:text-primary/80" />
          </WalletDropdown>
        </Wallet>
      )}
    </div>
  );
} 