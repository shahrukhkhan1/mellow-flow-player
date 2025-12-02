import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Music, 
  Cloud, 
  Sliders, 
  Activity, 
  Heart, 
  BarChart3, 
  Shield,
  Headphones,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const features = [
  {
    icon: Music,
    title: 'Upload & Play Music',
    description: 'Upload MP3 files from your device and create custom playlists. Works completely offline!'
  },
  {
    icon: Cloud,
    title: 'Cloud Sync',
    description: 'Sign in to sync your music library across all your devices automatically. Access your tracks anywhere!'
  },
  {
    icon: Sliders,
    title: 'Audio Effects',
    description: '10-band equalizer with 16+ presets, reverb effects, and playback speed control. Perfect your sound!'
  },
  {
    icon: Activity,
    title: 'Live Visualizers',
    description: 'Choose from 6 stunning audio visualizers including bars, waves, circular, spectrum, particles, and waveform.'
  },
  {
    icon: Shield,
    title: 'Hearing Protection',
    description: 'Built-in audio limiter prevents loud sounds from damaging your hearing. Listen safely!'
  },
  {
    icon: Heart,
    title: 'Favorites & Stats',
    description: 'Mark your favorite tracks and view detailed listening statistics including play counts and listening time.'
  },
  {
    icon: Headphones,
    title: 'Background Playback',
    description: 'Music keeps playing even when your screen is locked or you switch apps. Perfect for iOS devices!'
  },
  {
    icon: BarChart3,
    title: 'Smart Controls',
    description: 'Keyboard shortcuts, lock screen controls, Bluetooth support, and media notifications for seamless playback.'
  },
];

export const OnboardingDialog = ({ open, onOpenChange }: OnboardingDialogProps) => {
  const [currentPage, setCurrentPage] = useState(0);

  const nextPage = () => {
    if (currentPage < features.length - 1) {
      setCurrentPage(prev => prev + 1);
    } else {
      localStorage.setItem('pocket-mp3-onboarding-completed', 'true');
      onOpenChange(false);
    }
  };

  const prevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const skip = () => {
    localStorage.setItem('pocket-mp3-onboarding-completed', 'true');
    onOpenChange(false);
  };

  const currentFeature = features[currentPage];
  const Icon = currentFeature.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome to Pocket MP3!</DialogTitle>
          <DialogDescription>
            Discover all the powerful features
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center space-y-6 py-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="w-10 h-10 text-primary" />
          </div>
          
          <div className="text-center space-y-2">
            <h3 className="text-xl font-semibold">{currentFeature.title}</h3>
            <p className="text-sm text-muted-foreground">
              {currentFeature.description}
            </p>
          </div>

          <div className="flex gap-1">
            {features.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === currentPage 
                    ? 'w-8 bg-primary' 
                    : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            onClick={skip}
            className="flex-1"
          >
            Skip
          </Button>
          
          <div className="flex gap-2">
            {currentPage > 0 && (
              <Button
                variant="outline"
                size="icon"
                onClick={prevPage}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            
            <Button
              onClick={nextPage}
              className="gap-2"
            >
              {currentPage === features.length - 1 ? (
                'Get Started'
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};