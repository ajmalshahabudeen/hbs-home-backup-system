import React, { useEffect, useState } from 'react';
import { getAppPermissionsStatus, requestMediaPermissionWithPrompt } from '../utils/permissions';
import { PermissionModal } from './PermissionModal';

export const PermissionChecker: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkInitialPermissions();
  }, []);

  const checkInitialPermissions = async () => {
    setChecking(true);
    try {
      const status = await getAppPermissionsStatus();
      if (!status.mediaLibraryGranted) {
        setShowModal(true);
      }
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  };

  const handleGrant = async () => {
    setShowModal(false);
    await requestMediaPermissionWithPrompt();
  };

  if (checking || !showModal) return null;

  return (
    <PermissionModal
      visible={showModal}
      type="media"
      onRequestPermission={handleGrant}
      onClose={() => setShowModal(false)}
    />
  );
};
