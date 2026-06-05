import gssapi, base64, ssl, urllib.request as U

SERVER = 'cas-pr.pr.rt.ru'
TO = 'zubkov.evgeniy@rt.ru'

SOAP = (
    b'<?xml version="1.0" encoding="utf-8"?>'
    b'<soap:Envelope'
    b' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
    b' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
    b' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
    b'<soap:Header>'
    b'<t:RequestServerVersion Version="Exchange2016"/>'
    b'</soap:Header>'
    b'<soap:Body>'
    b'<m:CreateItem MessageDisposition="SendAndSaveCopy">'
    b'<m:Items>'
    b'<t:Message>'
    b'<t:Subject>Test Kerberos EWS</t:Subject>'
    b'<t:Body BodyType="Text">Test message via EWS + Kerberos</t:Body>'
    b'<t:ToRecipients>'
    b'<t:Mailbox>'
    b'<t:EmailAddress>zubkov.evgeniy@rt.ru</t:EmailAddress>'
    b'</t:Mailbox>'
    b'</t:ToRecipients>'
    b'</t:Message>'
    b'</m:Items>'
    b'</m:CreateItem>'
    b'</soap:Body>'
    b'</soap:Envelope>'
)

sn  = gssapi.Name('HTTP@' + SERVER, gssapi.NameType.hostbased_service)
tok = base64.b64encode(
    gssapi.SecurityContext(name=sn, usage='initiate').step()
).decode()

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = U.Request(
    'https://' + SERVER + '/EWS/Exchange.asmx',
    data=SOAP,
    method='POST',
)
req.add_header('Authorization', 'Negotiate ' + tok)
req.add_header('Content-Type', 'text/xml; charset=utf-8')

try:
    with U.urlopen(req, context=ctx, timeout=15) as resp:
        print('OK', resp.status)
        print(resp.read()[:500].decode('utf-8', errors='replace'))
except U.error.HTTPError as e:
    print('ERR', e.code)
    print(e.read()[:500].decode('utf-8', errors='replace'))
except Exception as e:
    print('FAIL', e)
