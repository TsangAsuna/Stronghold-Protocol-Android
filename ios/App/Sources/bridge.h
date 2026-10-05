// bridge.h — C interface exposed to Swift (SWIFT_OBJC_BRIDGING_HEADER).

#ifndef SP_BRIDGE_H
#define SP_BRIDGE_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/// Boots the embedded Node runtime (blocks until it exits). Returns node's exit code.
int sp_node_start(char** argv, int argc, const char* logPath);

#ifdef __cplusplus
}
#endif

#endif /* SP_BRIDGE_H */
