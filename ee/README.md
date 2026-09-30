# Enterprise Edition

Code in this directory is licensed under the [zaydemy Enterprise License](./LICENSE),
not the AGPL-3.0 license that covers the rest of the repository.

The core must stay complete without `ee/`: nothing outside this directory may
import from it. Enterprise modules plug into extension points exposed by the core.
