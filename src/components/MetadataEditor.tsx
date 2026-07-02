import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Music, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateTrackMetadata } from '@/lib/db';
import type { Track } from '@/hooks/useAudioPlayer';
import { logger } from '@/lib/logger';

interface MetadataEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: Track | null;
  onSaved: (updated: { id: string; title: string; artist: string; cover?: string }) => void;
}

// Resize cover image to a square 512x512 JPEG data URL to keep IndexedDB lean.
const fileToSquareCover = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        // cover-fit (crop to square)
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

export const MetadataEditor = ({ open, onOpenChange, track, onSaved }: MetadataEditorProps) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [cover, setCover] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (track) {
      setTitle(track.title);
      setArtist(track.artist);
      setCover(track.cover);
    }
  }, [track, open]);

  const handlePick = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Pick an image file');
      return;
    }
    try {
      const data = await fileToSquareCover(file);
      setCover(data);
    } catch (err) {
      logger.error('Cover processing failed:', err);
      toast.error('Could not process image');
    }
  };

  const handleSave = async () => {
    if (!track) return;
    const trimmedTitle = title.trim();
    const trimmedArtist = artist.trim();
    if (!trimmedTitle) {
      toast.error('Title cannot be empty');
      return;
    }
    setSaving(true);
    try {
      await updateTrackMetadata(track.id, {
        title: trimmedTitle,
        artist: trimmedArtist || 'Unknown',
        cover,
      });
      onSaved({ id: track.id, title: trimmedTitle, artist: trimmedArtist || 'Unknown', cover });
      toast.success('Track updated');
      onOpenChange(false);
    } catch (err) {
      logger.error('Metadata save failed:', err);
      toast.error('Failed to save metadata');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit track info</DialogTitle>
          <DialogDescription>Update the title, artist, and album artwork.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Square artwork */}
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border bg-muted flex-shrink-0">
              {cover ? (
                <img src={cover} alt="Album artwork" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <Music className="w-7 h-7" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePick(f);
                  e.currentTarget.value = '';
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload square artwork
              </Button>
              {cover && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-2 text-muted-foreground"
                  onClick={() => setCover(undefined)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove artwork
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground">
                Auto-cropped to 512×512 JPEG.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="md-title">Title</Label>
            <Input id="md-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="md-artist">Artist</Label>
            <Input id="md-artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
