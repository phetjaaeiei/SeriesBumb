import { adminCatalog } from './admin-catalog';
import { adminCommunity } from './admin-community';
import { adminSystem } from './admin-system';
import { comments, engagement, reviews } from './community';

// Public action names (actions.admin.tapes.save, ?_action=...) are the keys below; see tests/unit/action-names.test.ts.
export const server = {
  reviews,
  comments,
  engagement,
  admin: { ...adminCatalog, ...adminCommunity, ...adminSystem },
};
