{
  description = "Embera FireSight development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          appRelPath = "FireSight";
          locateRepoRoot = ''
            find_repo_root() {
              local dir="''${EMBERA_ROOT:-$PWD}"
              while [ "$dir" != "/" ]; do
                if [ -f "$dir/flake.nix" ] && [ -f "$dir/${appRelPath}/package.json" ]; then
                  printf '%s\n' "$dir"
                  return 0
                fi
                dir="$(dirname "$dir")"
              done
              return 1
            }

            ROOT="$(find_repo_root)" || {
              echo "error: could not locate the Embera repo root" >&2
              exit 1
            }
          '';

          runDev = pkgs.writeShellScriptBin "run-dev" ''
            set -euo pipefail

            ${locateRepoRoot}
            APP_DIR="$ROOT/${appRelPath}"

            cd "$APP_DIR"
            exec npm run dev -- --host 127.0.0.1 --port 5173
          '';

          runBuild = pkgs.writeShellScriptBin "run-build" ''
            set -euo pipefail

            ${locateRepoRoot}
            APP_DIR="$ROOT/${appRelPath}"

            cd "$APP_DIR"
            exec npm run build
          '';

          runPreview = pkgs.writeShellScriptBin "run-preview" ''
            set -euo pipefail

            ${locateRepoRoot}
            APP_DIR="$ROOT/${appRelPath}"

            cd "$APP_DIR"
            exec npm run preview -- --host 127.0.0.1 --port 4173
          '';
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22
              runDev
              runBuild
              runPreview
            ];

            shellHook = ''
              resolve_embera_root() {
                local dir="$PWD"
                while [ "$dir" != "/" ]; do
                  if [ -f "$dir/flake.nix" ] && [ -f "$dir/${appRelPath}/package.json" ]; then
                    printf '%s\n' "$dir"
                    return 0
                  fi
                  dir="$(dirname "$dir")"
                done
                printf '%s\n' "$PWD"
              }

              export EMBERA_ROOT="$(resolve_embera_root)"
              echo "Dev shell ready:"
              echo "  cd FireSight && npm ci"
              echo "  run-dev      # Vite on :5173"
              echo "  run-build    # production build"
              echo "  run-preview  # preview on :4173"
            '';
          };
        });
    };
}
