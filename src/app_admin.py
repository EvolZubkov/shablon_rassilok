import os

os.environ['APP_MODE'] = 'admin'

import app as core

if __name__ == '__main__':
    core.main()