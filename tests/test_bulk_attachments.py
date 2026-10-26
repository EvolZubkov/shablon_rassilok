"""Вложения рассылки: общие и индивидуальные файлы, лимит размера, проверка до отправки.

Чистая логика (routes/bulk_attachments.py) — без Flask и Exchange.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routes import bulk_attachments as att  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    """Загрузки каждого теста — в своей папке, настоящая не затрагивается."""
    monkeypatch.setattr(att, 'STORE_DIR', str(tmp_path / 'store'))
    yield


def write(path, data=b'x'):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


# ─── normalize_specs ─────────────────────────────────────────────────────────

class TestNormalizeSpecs:
    def test_no_attachments(self):
        assert att.normalize_specs({}) == []
        assert att.normalize_specs({'attachments': []}) == []

    def test_legacy_fields_become_one_individual_spec(self):
        specs = att.normalize_specs({
            'attach_enabled': True, 'attach_folder': ' C:\\docs ', 'attach_template': '{{ФИО}}.pdf',
            'attach_mode': 'template', 'attach_missing': 'skip',
        })
        assert specs == [{'kind': 'individual', 'folder': 'C:\\docs', 'mode': 'template',
                          'template': '{{ФИО}}.pdf', 'column': '', 'missing': 'skip'}]

    def test_legacy_disabled_gives_nothing(self):
        assert att.normalize_specs({'attach_enabled': False, 'attach_folder': 'x'}) == []

    def test_new_list_with_both_kinds(self):
        specs = att.normalize_specs({'attachments': [
            {'kind': 'common', 'files': ['a' * 32, 5, None]},
            {'kind': 'individual', 'folder': 'F', 'mode': 'column', 'column': 'Файл',
             'template': 'ignored', 'missing': 'stop'},
        ]})
        assert specs[0] == {'kind': 'common', 'files': ['a' * 32]}
        assert specs[1]['column'] == 'Файл'
        assert specs[1]['missing'] == 'stop'

    def test_unknown_policy_and_garbage_are_neutralised(self):
        specs = att.normalize_specs({'attachments': [
            'junk', {'kind': 'other'},
            {'kind': 'individual', 'folder': 'F', 'template': 't', 'missing': 'explode'},
        ]})
        assert len(specs) == 1
        assert specs[0]['missing'] == 'send'
        assert specs[0]['mode'] == 'template'

    def test_column_ignored_in_template_mode(self):
        spec = att.normalize_specs({'attachments': [
            {'kind': 'individual', 'folder': 'F', 'mode': 'template', 'template': 't', 'column': 'X'}]})[0]
        assert spec['column'] == ''

    def test_new_list_wins_over_legacy_fields(self):
        specs = att.normalize_specs({'attach_enabled': True, 'attach_folder': 'F',
                                     'attach_template': 't', 'attachments': []})
        assert specs == []


# ─── Лимит размера ───────────────────────────────────────────────────────────

class TestLimits:
    def test_default_limit_is_ten_megabytes(self):
        assert att.message_limit_bytes() == 10 * 1024 * 1024

    def test_configured_limit_is_used(self):
        assert att.message_limit_bytes(25) == 25 * 1024 * 1024

    def test_smtp_size_lowers_the_limit_but_never_raises_it(self):
        assert att.message_limit_bytes(25, 5 * 1024 * 1024) == 5 * 1024 * 1024
        assert att.message_limit_bytes(10, 50 * 1024 * 1024) == 10 * 1024 * 1024

    def test_zero_or_negative_configured_value_falls_back(self):
        assert att.message_limit_bytes(0) == 10 * 1024 * 1024
        assert att.message_limit_bytes(-3) == 10 * 1024 * 1024

    def test_files_budget_accounts_for_base64_and_body(self):
        limit = 10 * 1024 * 1024
        budget = att.files_budget(limit)
        # base64 раздувает файл на треть: пришедший в бюджет файл укладывается в лимит
        assert att.estimated_message_bytes(budget) <= limit
        assert budget < limit * 0.75

    def test_budget_never_negative(self):
        assert att.files_budget(1000) == 0


# ─── Опасные типы ────────────────────────────────────────────────────────────

class TestBlocked:
    @pytest.mark.parametrize('name', ['setup.exe', 'RUN.BAT', 'a.vbs', 'x.ps1', 'doc.js'])
    def test_blocked(self, name):
        assert att.blocked_extension(name)

    @pytest.mark.parametrize('name', ['doc.pdf', 'table.xlsx', 'readme', 'photo.jpeg', 'a.docx'])
    def test_allowed(self, name):
        assert att.blocked_extension(name) is None


# ─── Хранилище общих файлов ──────────────────────────────────────────────────

class TestUploadStore:
    def test_save_and_find(self):
        item = att.save_upload('Условия.pdf', b'12345')
        assert item['name'] == 'Условия.pdf'
        assert item['size'] == 5
        assert os.path.basename(att.store_path(item['token'])) == 'Условия.pdf'

    def test_name_is_cleaned_of_path_parts(self):
        item = att.save_upload('..\\..\\evil/../a:b.pdf', b'x')
        path = att.store_path(item['token'])
        assert os.path.dirname(os.path.dirname(path)) == att.STORE_DIR
        assert '..' not in item['name'] and '/' not in item['name'] and '\\' not in item['name']

    def test_blocked_type_is_refused(self):
        with pytest.raises(att.UploadError, match='.exe'):
            att.save_upload('virus.exe', b'x')

    def test_empty_file_is_refused(self):
        with pytest.raises(att.UploadError):
            att.save_upload('a.pdf', b'')

    def test_file_count_limit(self):
        with pytest.raises(att.UploadError, match=str(att.MAX_COMMON_FILES)):
            att.save_upload('a.pdf', b'x', existing_files=att.MAX_COMMON_FILES)

    def test_total_size_limit_counts_what_is_already_added(self):
        att.save_upload('a.pdf', b'x' * 60, existing_bytes=0, budget_bytes=100)
        with pytest.raises(att.UploadError, match='Не помещается'):
            att.save_upload('b.pdf', b'x' * 60, existing_bytes=60, budget_bytes=100)

    def test_unknown_or_malformed_tokens_resolve_to_nothing(self):
        assert att.store_path('') is None
        assert att.store_path('../../etc/passwd') is None
        assert att.store_path('0' * 32) is None
        assert att.store_path(None) is None

    def test_delete(self):
        item = att.save_upload('a.pdf', b'x')
        assert att.delete_upload(item['token']) is True
        assert att.store_path(item['token']) is None
        assert att.delete_upload('../nope') is False

    def test_purge_removes_only_old_entries(self):
        old = att.save_upload('old.pdf', b'x')
        fresh = att.save_upload('new.pdf', b'x')
        past = os.path.getmtime(os.path.join(att.STORE_DIR, old['token'])) - 3 * 24 * 3600
        os.utime(os.path.join(att.STORE_DIR, old['token']), (past, past))
        assert att.purge_store() == 1
        assert att.store_path(old['token']) is None
        assert att.store_path(fresh['token']) is not None

    def test_purge_all(self):
        att.save_upload('a.pdf', b'x')
        assert att.purge_store(None) == 1


# ─── Детальный поиск файла ───────────────────────────────────────────────────

class TestFindDetailed:
    def test_reasons(self, tmp_path):
        write(tmp_path / 'Договор.docx')
        write(tmp_path / 'Акт.docx')
        write(tmp_path / 'Акт.pdf')
        assert att.find_file_detailed(str(tmp_path), 'договор.DOCX')[1] == 'ok'
        assert att.find_file_detailed(str(tmp_path), 'Нет')[1] == 'missing'
        assert att.find_file_detailed(str(tmp_path), 'Акт')[1] == 'ambiguous'

    def test_resolve_detail_reports_expected_name(self, tmp_path):
        detail = att.resolve_attachment_detail(str(tmp_path), '{{ФИО}}.pdf', {'{{ФИО}}': 'ФИО'},
                                               {'ФИО': 'Иван'})
        assert detail == {'path': None, 'name': 'Иван.pdf', 'reason': 'missing'}

    def test_not_configured_and_no_name(self, tmp_path):
        assert att.resolve_attachment_detail('', 't', {}, {})['reason'] == 'not_configured'
        assert att.resolve_attachment_detail(str(tmp_path), '', {}, {'Ф': ''}, 'Ф')['reason'] == 'no_name'


# ─── План вложений строки ────────────────────────────────────────────────────

def individual(folder, template='{{ФИО}}.pdf', missing='send', **extra):
    return {'kind': 'individual', 'folder': str(folder), 'mode': 'template', 'template': template,
            'column': '', 'missing': missing, **extra}


class TestPlanRow:
    MAPPING = {'{{ФИО}}': 'ФИО'}

    def test_common_and_individual_together(self, tmp_path):
        write(tmp_path / 'Иван.pdf')
        common = att.save_upload('Общий.docx', b'abc')
        specs = [{'kind': 'common', 'files': [common['token']]}, individual(tmp_path)]
        plan = att.plan_row(specs, self.MAPPING, {'ФИО': 'Иван'})
        assert [i['name'] for i in plan['items']] == ['Общий.docx', 'Иван.pdf']
        assert plan['problems'] == []

    def test_two_individual_rows_of_attachments(self, tmp_path):
        write(tmp_path / 'Иван.pdf')
        write(tmp_path / 'Иван акт.pdf')
        specs = [individual(tmp_path), individual(tmp_path, '{{ФИО}} акт.pdf')]
        plan = att.plan_row(specs, self.MAPPING, {'ФИО': 'Иван'})
        assert [i['spec'] for i in plan['items']] == [0, 1]

    def test_missing_file_is_a_problem_of_its_own_spec(self, tmp_path):
        write(tmp_path / 'Иван.pdf')
        specs = [individual(tmp_path), individual(tmp_path, '{{ФИО}} акт.pdf')]
        plan = att.plan_row(specs, self.MAPPING, {'ФИО': 'Иван'})
        assert len(plan['items']) == 1
        assert plan['problems'] == [{'spec': 1, 'reason': 'missing', 'expected': 'Иван акт.pdf'}]

    def test_blocked_file_in_folder_is_not_attached(self, tmp_path):
        write(tmp_path / 'Иван.exe')
        plan = att.plan_row([individual(tmp_path, '{{ФИО}}.exe')], self.MAPPING, {'ФИО': 'Иван'})
        assert plan['items'] == []
        assert plan['problems'][0]['reason'] == 'blocked'

    def test_expired_common_file(self):
        plan = att.plan_row([{'kind': 'common', 'files': ['f' * 32]}], {}, {})
        assert plan['problems'][0]['reason'] == 'expired'


# ─── Проверка до отправки ────────────────────────────────────────────────────

class TestPreflight:
    MAPPING = {'{{ФИО}}': 'ФИО'}

    def rows(self):
        return [
            {'ФИО': 'Иван', 'Email': 'i@x.ru'},
            {'ФИО': 'Пётр', 'Email': 'p@x.ru'},
            {'ФИО': 'Анна', 'Email': ''},
        ]

    def test_counts_found_and_missing_and_skips_rows_without_email(self, tmp_path):
        write(tmp_path / 'Иван.pdf')
        report = att.preflight(self.rows(), [individual(tmp_path)], self.MAPPING, 'Email', True, 10 * 2**20)
        entry = report['attachments'][0]
        assert report['rows_checked'] == 2
        assert (entry['found'], entry['missing']) == (1, 1)
        assert entry['problems'][0] == {'row': 2, 'email': 'p@x.ru', 'expected': 'Пётр.pdf',
                                        'reason': 'missing', 'text': 'файл не найден'}

    def test_rows_without_email_counted_when_not_skipped(self, tmp_path):
        report = att.preflight(self.rows(), [individual(tmp_path)], self.MAPPING, 'Email', False, 10 * 2**20)
        assert report['rows_checked'] == 3

    def test_problem_list_is_capped(self, tmp_path):
        rows = [{'ФИО': f'Н{i}', 'Email': f'{i}@x.ru'} for i in range(100)]
        report = att.preflight(rows, [individual(tmp_path)], self.MAPPING, 'Email', True, 10 * 2**20, sample=5)
        entry = report['attachments'][0]
        assert entry['missing'] == 100
        assert len(entry['problems']) == 5

    def test_ambiguous_is_counted_separately(self, tmp_path):
        write(tmp_path / 'Иван.docx')
        write(tmp_path / 'Иван.pdf')
        spec = individual(tmp_path, '{{ФИО}}')
        report = att.preflight(self.rows()[:1], [spec], self.MAPPING, 'Email', True, 10 * 2**20)
        assert report['attachments'][0]['ambiguous'] == 1

    def test_oversize_rows_are_found_before_sending(self, tmp_path):
        write(tmp_path / 'Иван.pdf', b'x' * 3000)
        write(tmp_path / 'Пётр.pdf', b'x' * 10)
        limit = att.estimated_message_bytes(1000)   # меньше, чем у Ивана
        report = att.preflight(self.rows()[:2], [individual(tmp_path)], self.MAPPING, 'Email', True, limit)
        assert report['oversize']['count'] == 1
        assert report['oversize']['rows'][0]['row'] == 1

    def test_common_files_count_toward_every_row(self, tmp_path):
        common = att.save_upload('Большой.pdf', b'x' * 5000)
        limit = att.estimated_message_bytes(4000)
        report = att.preflight(self.rows()[:2], [{'kind': 'common', 'files': [common['token']]}],
                               {}, 'Email', True, limit)
        assert report['oversize']['count'] == 2
        assert report['common_bytes'] == 5000
        assert report['attachments'][0]['found'] == 2

    def test_no_specs_is_empty_report(self):
        report = att.preflight(self.rows(), [], {}, 'Email', True, 10 * 2**20)
        assert report['attachments'] == []
        assert report['oversize']['count'] == 0
