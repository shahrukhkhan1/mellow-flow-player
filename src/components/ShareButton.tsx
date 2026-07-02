import { useState } from 'react';
import { Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export const ShareButton = () => {
  const [open, setOpen] = useState(false);
  const appUrl = window.location.origin;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Pocket MP3',
          text: 'Check out this awesome music player!',
          url: appUrl,
        });
        toast.success('Shared successfully');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          logger.error('Error sharing:', error);
        }
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(appUrl);
        toast.success('Link copied to clipboard!');
      } catch (error) {
        logger.error('Error copying:', error);
        toast.error('Failed to copy link');
      }
    }
  };

  const generateQRCode = () => {
    // Use a QR code API to generate QR code
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(appUrl)}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Pocket MP3</DialogTitle>
          <DialogDescription>
            Share this app with your friends
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="p-4 bg-white rounded-xl">
            <img
              src={generateQRCode()}
              alt="QR Code"
              className="w-48 h-48"
            />
          </div>
          <div className="w-full p-3 bg-muted rounded-lg text-sm text-center break-all">
            {appUrl}
          </div>
          <Button onClick={handleShare} className="w-full gap-2">
            <Share2 className="w-4 h-4" />
            {navigator.share ? 'Share App' : 'Copy Link'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
