import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { localRepo } from '../db/repositories';
import { session } from '../state/session';

export function useEchoInboxActions() {
  const queryClient = useQueryClient();

  const refreshEchoQueries = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['echoInbox', session.profileId] });
    await queryClient.invalidateQueries({ queryKey: ['echoPinned', session.profileId] });
    await queryClient.invalidateQueries({ queryKey: ['echoFeed', session.profileId] });
  }, [queryClient]);

  const pinEcho = React.useCallback(
    async (encounterId: string) => {
      localRepo.pinEncounter(encounterId);
      await refreshEchoQueries();
    },
    [refreshEchoQueries],
  );

  const reportEcho = React.useCallback(
    async (encounterId: string) => {
      localRepo.reportEncounter(encounterId);
      await refreshEchoQueries();
    },
    [refreshEchoQueries],
  );

  const deleteEcho = React.useCallback(
    async (encounterId: string) => {
      localRepo.deleteEncounter(encounterId);
      await refreshEchoQueries();
    },
    [refreshEchoQueries],
  );

  const markSeen = React.useCallback(
    async (encounterId: string) => {
      localRepo.markEncounterSeen(encounterId);
      await refreshEchoQueries();
    },
    [refreshEchoQueries],
  );

  return {
    pinEcho,
    reportEcho,
    deleteEcho,
    markSeen,
  };
}
