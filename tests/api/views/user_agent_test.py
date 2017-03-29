from flask import Response, json
from flask.testing import FlaskClient
from werkzeug.datastructures import Headers


def test_request_with_user_agent_works(api, default_headers):
    assert isinstance(api, FlaskClient)
    assert isinstance(default_headers, Headers)

    response = api.get('/', headers=default_headers)
    assert isinstance(response, Response)

    assert response.status_code == 404


def test_missing_user_agent_returns_403(api, default_headers):
    assert isinstance(api, FlaskClient)
    assert isinstance(default_headers, Headers)

    default_headers.remove('User-Agent')

    response = api.get('/', headers=default_headers)
    assert isinstance(response, Response)
    assert response.status_code == 403

    json_data = json.loads(response.data)
    assert isinstance(json_data, dict)
    assert 'User-Agent header' in json_data.get('message')
