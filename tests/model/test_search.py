import config
from skylines import create_app
from skylines.model import db, User, Club, Airport
from skylines.model.search import (
    combined_search_query, escape_tokens, text_to_tokens
)
from tests import setup_db, teardown_db
from tests.data.bootstrap import bootstrap

MODELS = [User, Club, Airport]


def search(text):
    # Split the search text into tokens and escape them properly
    tokens = text_to_tokens(text)
    tokens = escape_tokens(tokens)

    # Create combined search query
    return combined_search_query(MODELS, tokens)


class TestSearch:

    # Create an empty database before we start our tests for this module
    @classmethod
    def setup_class(cls):
        """Function called by nose on module load"""
        cls.app = create_app(config_file=config.TESTING_CONF_PATH)

        with cls.app.app_context():
            setup_db()

            # Add sample data to the database
            bootstrap()

    # Tear down that database
    @classmethod
    def teardown_class(cls):
        """Function called by nose after all tests in this module ran"""
        with cls.app.app_context():
            teardown_db()

    def setup(self):
        """Prepare model test fixture."""
        self.context = self.app.app_context()
        self.context.push()

    def teardown(self):
        """Finish model test fixture."""
        db.session.rollback()
        self.context.pop()

    def test_tokenizer(self):
        # Check that this does not throw exceptions
        text_to_tokens('\\')
        text_to_tokens('blabla \\')
        text_to_tokens('"')
        text_to_tokens('"blabla \\')

        # Check that the tokenizer returns expected results
        assert text_to_tokens('a b c') == ['a', 'b', 'c']
        assert text_to_tokens('a \'b c\'') == ['a', 'b c']
        assert text_to_tokens('a "b c" d') == ['a', 'b c', 'd']
        assert text_to_tokens('old "mac donald" has a FARM') == \
            ['old', 'mac donald', 'has', 'a', 'FARM']

    def test_escaping(self):
        assert escape_tokens(['hello!']) == ['hello!']
        assert escape_tokens(['hello *!']) == ['hello %!']
        assert escape_tokens(['hello %!']) == ['hello \\%!']
        assert escape_tokens(['hello _!']) == ['hello \\_!']

    def test_search(self):
        assert search('example').count() == 2
        assert search('user').count() == 1
        assert search('man').count() == 1
        assert search('man*er').count() == 1
        assert search('*er').count() == 2
        assert search('exa*er').count() == 2
        assert search('exp*er').count() == 0
        assert search('xyz').count() == 0
