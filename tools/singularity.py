"""Singularity 0.4 project-model CLI. All output is JSON; no legacy record adapter."""
import argparse
import json
import sys
from pathlib import Path

from singularity_core import Store, empty_model, validate, apply, ModelError
from singularity_core.model import TYPES, RELATIONS
from singularity_core.storage import unique_object
from singularity_core.query import traverse, tree, check_references, gaps


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=Path.cwd())
    commands = parser.add_subparsers(dest='command', required=True)
    init = commands.add_parser('init')
    init.add_argument('--name', required=True)
    for name in ('validate', 'list', 'gaps', 'schema'):
        commands.add_parser(name)
    get = commands.add_parser('get')
    get.add_argument('id')
    for name in ('context', 'impact'):
        command = commands.add_parser(name)
        command.add_argument('id')
        command.add_argument('--depth', type=int, default=2)
    command = commands.add_parser('tree')
    command.add_argument('id')
    command = commands.add_parser('check-refs')
    command.add_argument('--external', action='store_true')
    command = commands.add_parser('apply')
    command.add_argument('file', type=Path, help='JSON array of put/delete operations')
    command.add_argument('--expected', required=True, help='revision from list/get/validate')
    command.add_argument('--actor', choices=('Human', 'AI'), default='AI')
    command.add_argument('--basis')
    command.add_argument('--dry-run', action='store_true')
    command = commands.add_parser('serve')
    command.add_argument('--port', type=int, default=8765)
    command.add_argument('--open', action='store_true')
    args = parser.parse_args(argv)
    try:
        store = Store(args.project)
        if args.command == 'init':
            result = {'revision': store.write(empty_model(args.name), None)}
        elif args.command == 'schema':
            result = {'format': 3, 'node_types': TYPES, 'relation_impact_directions': RELATIONS}
        elif args.command == 'serve':
            from singularity_web import serve_editor
            serve_editor(args.project, args.port, open_browser=args.open)
            return 0
        else:
            model, revision = store.read()
            if args.command == 'apply':
                if args.expected != revision:
                    raise ModelError('Model changed; reload and review before retrying')
                operations = json.loads(args.file.read_text(encoding='utf-8-sig'), object_pairs_hook=unique_object)
                updated = apply(model, operations, args.actor, args.basis)
                result = {'model': updated, 'revision': revision, 'dry_run': True} if args.dry_run else {
                    'revision': store.write(updated, args.expected), 'dry_run': False}
            elif args.command == 'list':
                result = {'revision': revision, 'model': model}
            elif args.command == 'validate':
                result = {'revision': revision, 'valid': True, 'counts': {
                    key: len(model[key]) for key in ('nodes', 'relations', 'references', 'views')}}
            elif args.command == 'get':
                item = next((item for key in ('nodes', 'relations', 'references', 'views')
                             for item in model[key] if item['id'] == args.id), None)
                if item is None:
                    raise ModelError('Object not found')
                result = {'revision': revision, 'object': item}
            elif args.command in ('context', 'impact'):
                result = traverse(model, args.id, args.depth, args.command == 'impact')
            elif args.command == 'tree':
                result = tree(model, args.id)
            elif args.command == 'check-refs':
                result = check_references(model, args.project, args.external)
            else:
                result = gaps(model)
        print(json.dumps(result, ensure_ascii=True, indent=2, allow_nan=False))
        return 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=True), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
