"""Видимость категорий шаблонов для аудитории и экспорт config.ini."""
import configparser
import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.category_visibility import (  # noqa: E402
    build_config_text,
    filter_shared_templates,
    is_category_allowed,
    parse_visible_categories,
)


class TestParse:
    def test_splits_by_semicolon_and_trims(self):
        assert parse_visible_categories(' Новости ; Акции ;; ') == ['Новости', 'Акции']

    def test_keeps_commas_inside_name(self):
        assert parse_visible_categories('Скидки, акции;HR') == ['Скидки, акции', 'HR']

    def test_dedupes_keeping_order(self):
        assert parse_visible_categories('A;B;A') == ['A', 'B']

    def test_empty_or_none_means_no_restriction(self):
        assert parse_visible_categories('') == []
        assert parse_visible_categories(None) == []


class TestAllowed:
    def test_empty_allowed_list_allows_everything(self):
        assert is_category_allowed('Любая', []) is True
        assert is_category_allowed('', []) is True

    def test_only_listed_categories_pass(self):
        assert is_category_allowed('Новости', ['Новости']) is True
        assert is_category_allowed('Акции', ['Новости']) is False

    def test_uncategorised_hidden_when_restricted(self):
        assert is_category_allowed('', ['Новости']) is False


class TestFilter:
    def _templates(self):
        return [
            {'id': 'a', 'category': 'Новости', 'isPreset': False},
            {'id': 'b', 'category': 'Акции', 'isPreset': False},
            {'id': 'c', 'category': '', 'isPreset': False},
            {'id': 'p', 'category': '', 'isPreset': True},
        ]

    def test_filters_and_keeps_presets(self):
        result = filter_shared_templates(self._templates(), ['Новости'])
        assert [t['id'] for t in result] == ['a', 'p']

    def test_no_restriction_returns_all(self):
        assert len(filter_shared_templates(self._templates(), [])) == 4

    def test_does_not_mutate_input(self):
        src = self._templates()
        filter_shared_templates(src, ['Новости'])
        assert len(src) == 4


class TestBuildConfig:
    def _parse(self, text):
        cfg = configparser.RawConfigParser()
        cfg.read_file(io.StringIO(text))
        return cfg['app']

    def test_sets_profile_and_categories(self):
        text = build_config_text({'port': '7788', 'profile': 'old'}, 'audience_b', ['Новости', 'Акции'])
        app = self._parse(text)
        assert app['profile'] == 'audience_b'
        assert app['visible_categories'] == 'Новости; Акции'
        assert app['port'] == '7788'

    def test_empty_categories_omits_key(self):
        app = self._parse(build_config_text({'port': '7788', 'visible_categories': 'X'}, 'default', []))
        assert 'visible_categories' not in app

    def test_drops_runtime_resolved_keys(self):
        text = build_config_text({'network_path_linux_resolved': '/mnt/x', 'port': '1'}, 'default', [])
        assert 'network_path_linux_resolved' not in self._parse(text)

    def test_keeps_backslashes_and_percent(self):
        text = build_config_text({'network_path_win': r'\ks\dfs\100%'}, 'default', [])
        assert self._parse(text)['network_path_win'] == r'\ks\dfs\100%'
