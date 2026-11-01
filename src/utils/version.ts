// Only `version` is bundled: esbuild drops the rest of package.json.
import { version } from '../../package.json';

/** App version, from package.json (bumped on main by .github/workflows/version-bump.yml). */
export const APP_VERSION = version;
