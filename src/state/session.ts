export const session = {
  profileId: '',
  lumeId: '',
  isReady: false,
};

export function setSessionIdentity(identity: { profileId: string; lumeId: string }) {
  session.profileId = identity.profileId;
  session.lumeId = identity.lumeId;
  session.isReady = true;
}

export function clearSessionIdentity() {
  session.profileId = '';
  session.lumeId = '';
  session.isReady = false;
}
