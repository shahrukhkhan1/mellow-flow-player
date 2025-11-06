import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ListMusic, Plus, Trash2, Save, Heart } from 'lucide-react';
import { getAllPlaylists, savePlaylist, deletePlaylist, getAllFavorites } from '@/lib/db';
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
  const [favoritesCount, setFavoritesCount] = useState(0);

  useEffect(() => {
    loadPlaylists();
    loadFavorites();
  }, []);

  const loadPlaylists = async () => {
    const stored = await getAllPlaylists();
    setPlaylists(stored);
  };

  const loadFavorites = async () => {
    const favs = await getAllFavorites();
    setFavoritesCount(favs.length);
  };

  const handleLoadFavorites = async () => {
    const favTrackIds = await getAllFavorites();
    if (favTrackIds.length === 0) {
      toast.info('No favorites yet');
      return;
    }
    onLoadPlaylist(favTrackIds);
    setIsOpen(false);
    toast.success(`Loaded ${favTrackIds.length} favorites`);
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
    await loadFavorites();
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

          {/* Favorites Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Favorites</label>
            <div
              onClick={handleLoadFavorites}
              className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-red-500/10 to-pink-500/10 border border-red-500/20 hover:border-red-500/40 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                <div>
                  <p className="font-medium">My Favorites</p>
                  <p className="text-xs text-muted-foreground">
                    {favoritesCount} {favoritesCount === 1 ? 'track' : 'tracks'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="pointer-events-none"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
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
