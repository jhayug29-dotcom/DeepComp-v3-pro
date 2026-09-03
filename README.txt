DeepComp Panel — by yugz.fx
===========================
Version 6.3.0

INSTALL (automatic — OS + AE version detection)
-------------------
Windows : double-click  Install-Windows.bat
macOS   : double-click  Install-Mac.command
          (first time: right-click > Open, or run
           chmod +x Install-Mac.command in Terminal)

The installer:
  1. Detects Windows/macOS and installed After Effects versions, then
     installs the panel to the correct current-user CEP location
  2. Enables unsigned CEP extensions for every runtime (CSXS 5-15),
     so it works on old and brand-new After Effects alike
  3. Backs up your saved library, copies the panel to the Adobe CEP
     extensions folder, and installs bundled presets for detected AE versions
  4. Verifies the installation

Then restart After Effects and open:
  Window > Extensions > deepcomp panel by yugz.fx


FIRST LAUNCH
------------
The panel greets you with a short welcome, then configures itself:
  - detects your exact After Effects version and OS
  - creates the DeepComp library folders
  - turns on "Allow Scripts to Write Files and Access Network"
  - installs the bundled .ffx presets into your AE User Presets folder
  - runs a sandboxed self-test of every tool and disables anything
    your build cannot do (instead of failing silently)

You can re-run it any time by clicking the compatibility bar under the
panel title.


AUTOMATIC UPDATES
-----------------
DeepComp checks for updates on launch (at most a few times a day) and
shows a banner when a new version is ready. Clicking Update downloads
the new files and writes them into the installed panel in place — no
reinstall, no losing your library. Files are only written once every
download has succeeded, so an interrupted update can never leave a
broken panel behind.

After an update the setup wizard re-runs once so any new tool
configures itself. Click the version pill in the header to check for
updates manually.


COMPATIBILITY
-------------
After Effects CC 2015 (13.x) through the latest release, Windows and
macOS. Version-specific paths (User Presets folder, AppData/Library)
are resolved at runtime, so the same package works on every machine.
