import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_state.dart';
import '../services/local_db.dart';
import '../services/offline_sync.dart';

/// Blocks the normal app UI (POS/shell) until the local cache DB has been upgraded to an
/// encrypted (SQLCipher) file. Takes priority over everything below it in the tree — an unsynced
/// offline bill must never be silently discarded by a plaintext→encrypted swap, so the app waits
/// here until the outbox drains. Mirrors the desktop app's migration gate in App.tsx.
class MigrationGate extends StatefulWidget {
  const MigrationGate({super.key, required this.child});

  final Widget child;

  @override
  State<MigrationGate> createState() => _MigrationGateState();
}

class _MigrationGateState extends State<MigrationGate> {
  MigrationStatus? _status;
  bool _retrying = false;

  @override
  void initState() {
    super.initState();
    _check(autoRetry: true);
  }

  Future<void> _check({required bool autoRetry}) async {
    final status = await LocalDb.instance.checkMigration();
    if (!mounted) return;
    if (status.state == MigrationState.blocked && autoRetry) {
      final auth = context.read<AuthState>();
      if (auth.isLoggedIn) {
        await _retry();
        return;
      }
    }
    setState(() => _status = status);
  }

  Future<void> _retry() async {
    setState(() => _retrying = true);
    try {
      final sync = context.read<OfflineSyncService>();
      final retried = await LocalDb.instance.retryMigration(() => sync.syncNow());
      if (!mounted) return;
      setState(() => _status = retried);
    } finally {
      if (mounted) setState(() => _retrying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    if (status == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (status.state != MigrationState.blocked) {
      return widget.child;
    }

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.lock_clock_outlined, size: 48),
                const SizedBox(height: 16),
                const Text(
                  'Enabling secure storage',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                if (status.pendingCount > 0)
                  Text(
                    '${status.pendingCount} bill(s) still need to sync before this device\'s local storage can be encrypted.',
                    textAlign: TextAlign.center,
                  ),
                if (status.failedCount > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      '${status.failedCount} item(s) failed to sync and need to be resolved first.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                const SizedBox(height: 12),
                const Text(
                  'Connect to the internet and retry — nothing is lost, the app just won\'t proceed until every bill is safely on the server.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _retrying ? null : _retry,
                  child: Text(_retrying ? 'Retrying…' : 'Retry now'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
