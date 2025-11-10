import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, User as UserIcon, Cloud, CloudOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface UserMenuProps {
  syncStatus?: 'idle' | 'syncing' | 'error';
  onSyncNow?: () => void;
}

export const UserMenu = ({ syncStatus = 'idle', onSyncNow }: UserMenuProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
      navigate('/auth');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/auth')}
        className="gap-2"
      >
        <UserIcon className="w-4 h-4" />
        <span className="hidden sm:inline">Sign In</span>
      </Button>
    );
  }

  const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full relative">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials(user.email || 'U')}
            </AvatarFallback>
          </Avatar>
          {syncStatus === 'syncing' && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
          )}
          {syncStatus === 'error' && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm">
          <p className="font-medium">{user.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {syncStatus === 'syncing' && 'Syncing...'}
            {syncStatus === 'idle' && 'Synced'}
            {syncStatus === 'error' && 'Sync error'}
          </p>
        </div>
        <DropdownMenuSeparator />
        {onSyncNow && (
          <DropdownMenuItem onClick={onSyncNow} disabled={syncStatus === 'syncing'}>
            {syncStatus === 'syncing' ? (
              <CloudOff className="w-4 h-4 mr-2" />
            ) : (
              <Cloud className="w-4 h-4 mr-2" />
            )}
            Sync Now
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
