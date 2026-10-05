// NodeStart.cpp — minimal C++ shim linking node::Start from the static
// libnode.a (nodejs-mobile iOS build). Exposed to Swift through bridge.h as
// `sp_node_start(_ args: [String], logPath: String) -> Int32`.
// Blocks until the Node program exits; run it on a dedicated big-stack thread
// (see NodeRuntime.swift).

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include <node.h>

extern "C" int sp_node_start(char** argv, int argc, const char* logPath) {
    if (logPath && *logPath) {
        FILE* out = freopen(logPath, "a", stdout);
        FILE* err = freopen(logPath, "a", stderr);
        if (out) setvbuf(out, nullptr, _IOLBF, 0);
        if (err) setvbuf(err, nullptr, _IONBF, 0);
    }
    std::vector<char*> args;
    args.reserve(static_cast<size_t>(argc));
    for (int i = 0; i < argc; i++) {
        args.push_back(strdup(argv[i] ? argv[i] : ""));
    }
    // Blocks until the Node program exits (process shutdown or fatal error).
    return node::Start(static_cast<int>(args.size()), args.data());
}
