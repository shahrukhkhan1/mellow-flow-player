import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ListMusic, Plus, Trash2, Save } from 'lucide-react';
import { getAllPlaylists, savePlaylist, deletePlaylist } from '@/lib/db';
import { Track } from '@/hooks/useAudioPlayer';
import { toast } from 'sonner';

interface PlaylistManagerProps {
  currentPlaylist: Track[];
  onLoadPlaylist: (trackIds: string[]) => void;
}

export const PlaylistManager = ({ currentPlaylist, onLoadPlaylist }: PlaylistManagerProps) => {
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    const stored = await getAllPlaylists();
    setPlaylists(stored);
  };

  const handleSavePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      toast.error('Please enter a playlist name');
      return;
    }

    if (currentPlaylist.length === 0) {
      toast.error('Add some tracks first');
      return;
    }

    const trackIds = currentPlaylist.map(t => t.id);
    await savePlaylist(newPlaylistName, trackIds);
    setNewPlaylistName('');
    await loadPlaylists();
    toast.success(`Playlist "${newPlaylistName}" saved!`);
  };

  const handleLoadPlaylist = (trackIds: string[]) => {
    onLoadPlaylist(trackIds);
    setIsOpen(false);
    toast.success('Playlist loaded!');
  };

  const handleDeletePlaylist = async (id: string, name: string) => {
    await deletePlaylist(id);
    await loadPlaylists();
    toast.success(`Playlist "${name}" deleted`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full">
          <ListMusic className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Playlist Manager</DialogTitle>
          <DialogDescription>
            Save and manage your playlists for quick access to your favorite tracks
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Save Current Playlist */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Save Current Playlist</label>
            <div className="flex gap-2">
              <Input
                placeholder="Playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSavePlaylist()}
              />
              <Button onClick={handleSavePlaylist} size="icon">
                <Save className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {currentPlaylist.length} tracks in current playlist
            </p>
          </div>

          {/* Saved Playlists */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Saved Playlists</label>
            {playlists.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No saved playlists yet
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {playlists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{playlist.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {playlist.trackIds.length} tracks
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleLoadPlaylist(playlist.trackIds)}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletePlaylist(playlist.id, playlist.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
